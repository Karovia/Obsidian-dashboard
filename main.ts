import {
  App,
  ItemView,
  MarkdownRenderer,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath
} from "obsidian";

const DASHBOARD_VIEW_TYPE = "liquid-dashboard-home-view";

type DashboardPage = "home" | "tasks" | "reading" | "notes" | "askai" | "settings";
type TaskScope = "today" | "week" | "next7";
type TaskPriority = "high" | "medium" | "normal" | "low";
type AiAction = "summary" | "question" | "mindmap";

interface CountdownItem {
  name: string;
  date: string;
}

interface DashboardSettings {
  taskFilePath: string;
  readingNotesPath: string;
  aiOutputRoot: string;
  autoOpenDashboard: boolean;
  recentNoteLimit: number;
  openAiBaseUrl: string;
  openAiApiKey: string;
  openAiModel: string;
  countdowns: CountdownItem[];
}

interface DashboardTask {
  content: string;
  date: string;
  time: string;
  completed: boolean;
  priority: TaskPriority;
  line: number;
  raw: string;
}

interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MindmapNode {
  id: string;
  label: string;
  parentId?: string;
}

const DEFAULT_SETTINGS: DashboardSettings = {
  taskFilePath: "Dashboard/Tasks.md",
  readingNotesPath: "Dashboard/Reading Notes.md",
  aiOutputRoot: "AI Outputs",
  autoOpenDashboard: true,
  recentNoteLimit: 8,
  openAiBaseUrl: "https://api.openai.com/v1",
  openAiApiKey: "",
  openAiModel: "gpt-4o-mini",
  countdowns: [
    {
      name: "Example deadline",
      date: formatDate(addDays(today(), 7))
    }
  ]
};

const PRIORITY_META: Record<TaskPriority, { label: string; marker: string; rank: number }> = {
  high: { label: "High", marker: "⏫", rank: 3 },
  medium: { label: "Medium", marker: "🔼", rank: 2 },
  normal: { label: "Normal", marker: "", rank: 1 },
  low: { label: "Low", marker: "🔽", rank: 0 }
};

const PAGE_META: Array<{ id: DashboardPage; label: string }> = [
  { id: "home", label: "Home" },
  { id: "tasks", label: "Tasks" },
  { id: "reading", label: "Reading" },
  { id: "notes", label: "Notes" },
  { id: "askai", label: "Ask AI" },
  { id: "settings", label: "Settings" }
];

export default class LiquidDashboardPlugin extends Plugin {
  settings: DashboardSettings;

  async onload() {
    await this.loadSettings();

    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new LiquidDashboardView(leaf, this)
    );

    this.addRibbonIcon("layout-dashboard", "Open Liquid Dashboard", () => {
      void this.activateDashboard();
    });

    this.addCommand({
      id: "open-liquid-dashboard",
      name: "Open Liquid Dashboard",
      callback: () => {
        void this.activateDashboard();
      }
    });

    this.addSettingTab(new LiquidDashboardSettingTab(this.app, this));

    if (this.settings.autoOpenDashboard) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateDashboard();
      });
    }
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  async activateDashboard() {
    const existingLeaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];

    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: DASHBOARD_VIEW_TYPE,
      active: true
    });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshDashboardViews();
  }

  refreshDashboardViews() {
    this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof LiquidDashboardView) {
        void view.render();
      }
    });
  }
}

class LiquidDashboardView extends ItemView {
  private plugin: LiquidDashboardPlugin;
  private page: DashboardPage = "home";
  private taskScope: TaskScope = "today";
  private selectedDate = formatDate(today());
  private visibleMonth = startOfMonth(today());
  private selectedFile: TFile | null = null;
  private showReadingNotes = false;
  private noteSearch = "";
  private aiQuestion = "";
  private aiResult = "";
  private aiBusy = false;
  private taskInput: HTMLInputElement | null = null;
  private taskDateInput: HTMLInputElement | null = null;
  private taskTimeInput: HTMLInputElement | null = null;
  private taskPrioritySelect: HTMLSelectElement | null = null;
  private readingNoteInput: HTMLTextAreaElement | null = null;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LiquidDashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText() {
    return "Liquid Dashboard";
  }

  getIcon() {
    return "layout-dashboard";
  }

  async onOpen() {
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
    await this.render();
  }

  async onClose() {
    this.contentEl.empty();
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
  }

  private scheduleRefresh() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = window.setTimeout(() => {
      void this.render();
    }, 300);
  }

  async render() {
    const tasks = await this.loadTasks();
    const notes = this.getReadableNotes();

    if (!this.selectedFile && notes.length > 0) {
      this.selectedFile = notes[0];
    }

    this.contentEl.empty();
    this.contentEl.addClass("liquid-dashboard-view");

    const shell = this.contentEl.createDiv({ cls: "ld-shell" });
    this.renderNav(shell);

    if (this.page === "home") {
      await this.renderHome(shell, tasks, notes);
    } else if (this.page === "tasks") {
      this.renderTasksPage(shell, tasks);
    } else if (this.page === "reading") {
      await this.renderReadingPage(shell, notes);
    } else if (this.page === "notes") {
      await this.renderNotesPage(shell);
    } else if (this.page === "askai") {
      await this.renderAskAiPage(shell, notes);
    } else {
      this.renderDashboardSettingsPage(shell);
    }
  }

  private renderNav(container: HTMLElement) {
    const nav = container.createDiv({ cls: "ld-top-nav ld-glass" });
    const brand = nav.createDiv({ cls: "ld-brand" });
    brand.createDiv({ cls: "ld-brand-title", text: "Liquid Dashboard" });
    brand.createDiv({ cls: "ld-brand-subtitle", text: formatReadableDate(today()) });

    const tabs = nav.createDiv({ cls: "ld-main-tabs" });
    PAGE_META.forEach((item) => {
      const button = tabs.createEl("button", {
        cls: `ld-main-tab ${this.page === item.id ? "is-active" : ""}`,
        text: item.label
      });
      button.addEventListener("click", () => {
        this.page = item.id;
        void this.render();
      });
    });
  }

  private async renderHome(container: HTMLElement, tasks: DashboardTask[], notes: TFile[]) {
    this.renderHero(container, tasks);

    const grid = container.createDiv({ cls: "ld-grid" });
    const left = grid.createDiv({ cls: "ld-stack ld-stack-main" });
    const right = grid.createDiv({ cls: "ld-stack ld-stack-side" });

    this.renderQuickAdd(left);
    this.renderTaskPanel(left, tasks);
    await this.renderSelectedNotePreview(left, notes[0] ?? null, "Latest note");

    this.renderCalendar(right, tasks);
    this.renderCountdowns(right);
    this.renderRecentNotes(right, notes);
  }

  private renderHero(container: HTMLElement, tasks: DashboardTask[]) {
    const todayTasks = this.getTasksForRange(tasks, formatDate(today()), formatDate(today()));
    const nextSevenTasks = this.getTasksForRange(tasks, formatDate(today()), formatDate(addDays(today(), 6)));
    const overdueTasks = tasks.filter((task) => !task.completed && this.isTaskOverdue(task));

    const hero = container.createDiv({ cls: "ld-hero ld-glass" });
    const copy = hero.createDiv();
    copy.createDiv({ cls: "ld-kicker", text: "Today" });
    copy.createEl("h1", { text: getGreeting() });
    copy.createDiv({
      cls: "ld-subtitle",
      text: "Review today, then shape the next seven days."
    });

    const stats = hero.createDiv({ cls: "ld-stats" });
    this.renderStat(stats, String(todayTasks.filter((task) => !task.completed).length), "Today");
    this.renderStat(stats, String(nextSevenTasks.filter((task) => !task.completed).length), "Next 7 days");
    this.renderStat(stats, String(overdueTasks.length), "Overdue");
  }

  private renderStat(container: HTMLElement, value: string, label: string) {
    const stat = container.createDiv({ cls: "ld-stat" });
    stat.createDiv({ cls: "ld-stat-value", text: value });
    stat.createDiv({ cls: "ld-stat-label", text: label });
  }

  private renderTasksPage(container: HTMLElement, tasks: DashboardTask[]) {
    const grid = container.createDiv({ cls: "ld-grid ld-grid-wide" });
    const left = grid.createDiv({ cls: "ld-stack ld-stack-main" });
    const right = grid.createDiv({ cls: "ld-stack ld-stack-side" });

    this.renderQuickAdd(left);
    this.renderTaskPanel(left, tasks);
    this.renderCalendar(right, tasks);
    this.renderTaskFileCard(right);
  }

  private renderQuickAdd(container: HTMLElement) {
    const card = container.createDiv({ cls: "ld-card ld-glass ld-quick-add" });
    card.createEl("h2", { text: "Quick add task" });

    const form = card.createEl("form", { cls: "ld-task-form ld-task-form-time" });
    this.taskInput = form.createEl("input", {
      cls: "ld-input ld-task-input",
      attr: {
        type: "text",
        placeholder: "Task content"
      }
    });

    this.taskDateInput = form.createEl("input", {
      cls: "ld-input",
      attr: {
        type: "date",
        value: this.selectedDate
      }
    });

    this.taskTimeInput = form.createEl("input", {
      cls: "ld-input",
      attr: {
        type: "time",
        value: formatTime(new Date())
      }
    });

    this.taskPrioritySelect = form.createEl("select", { cls: "ld-input ld-select" });
    (Object.keys(PRIORITY_META) as TaskPriority[]).forEach((priority) => {
      this.taskPrioritySelect?.createEl("option", {
        text: PRIORITY_META[priority].label,
        value: priority
      });
    });
    this.taskPrioritySelect.value = "normal";

    form.createEl("button", {
      cls: "ld-button ld-button-primary",
      text: "Add",
      attr: {
        type: "submit"
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleAddTask();
    });
  }

  private renderTaskPanel(container: HTMLElement, tasks: DashboardTask[]) {
    const card = container.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: "Tasks" });

    const tabs = header.createDiv({ cls: "ld-tabs" });
    const modes: Array<{ mode: TaskScope; label: string }> = [
      { mode: "today", label: this.selectedDate === formatDate(today()) ? "Today" : this.selectedDate },
      { mode: "week", label: "This week" },
      { mode: "next7", label: "Next 7 days" }
    ];

    modes.forEach((item) => {
      const button = tabs.createEl("button", {
        cls: `ld-tab ${this.taskScope === item.mode ? "is-active" : ""}`,
        text: item.label
      });
      button.addEventListener("click", () => {
        this.taskScope = item.mode;
        void this.render();
      });
    });

    const taskList = card.createDiv({ cls: "ld-task-list" });
    const visibleTasks = this.getVisibleTasks(tasks);

    if (visibleTasks.length === 0) {
      taskList.createDiv({ cls: "ld-empty", text: "No tasks in this range yet." });
      return;
    }

    visibleTasks.forEach((task) => this.renderTask(taskList, task));
  }

  private renderTask(container: HTMLElement, task: DashboardTask) {
    const row = container.createDiv({ cls: `ld-task ${task.completed ? "is-completed" : ""}` });

    const checkbox = row.createEl("input", {
      cls: "ld-checkbox",
      attr: {
        type: "checkbox"
      }
    });
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => {
      void this.toggleTask(task);
    });

    const body = row.createDiv({ cls: "ld-task-body" });
    body.createDiv({ cls: "ld-task-title", text: task.content });

    const meta = body.createDiv({ cls: "ld-task-meta" });
    meta.createSpan({ text: `${formatShortDate(parseDate(task.date))} ${task.time}`.trim() });
    meta.createSpan({ cls: `ld-priority ld-priority-${task.priority}`, text: PRIORITY_META[task.priority].label });

    if (!task.completed && this.isTaskOverdue(task)) {
      meta.createSpan({ cls: "ld-overdue", text: "Overdue" });
    }
  }

  private async renderReadingPage(container: HTMLElement, notes: TFile[]) {
    const card = container.createDiv({ cls: "ld-card ld-glass ld-reader-shell" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: "Reading" });
    const actions = header.createDiv({ cls: "ld-actions" });
    actions.createEl("button", {
      cls: `ld-button ${this.showReadingNotes ? "ld-button-primary" : ""}`,
      text: this.showReadingNotes ? "Hide notes" : "Show notes"
    }).addEventListener("click", () => {
      this.showReadingNotes = !this.showReadingNotes;
      void this.render();
    });

    const layout = card.createDiv({
      cls: `ld-reader-layout ${this.showReadingNotes ? "has-notes" : "is-reading-only"}`
    });

    this.renderVaultNoteList(layout, notes);

    const article = layout.createDiv({ cls: "ld-reader-article" });
    await this.renderSelectedNotePreview(article, this.selectedFile, this.selectedFile?.basename ?? "Preview", true);

    if (this.showReadingNotes) {
      this.renderReadingNoteEditor(layout);
    }
  }

  private renderVaultNoteList(container: HTMLElement, notes: TFile[]) {
    const sidebar = container.createDiv({ cls: "ld-note-list" });
    sidebar.createDiv({ cls: "ld-panel-title", text: "All notes" });
    const search = sidebar.createEl("input", {
      cls: "ld-input",
      attr: {
        type: "search",
        placeholder: "Search notes",
        value: this.noteSearch
      }
    });
    search.addEventListener("input", () => {
      this.noteSearch = search.value;
      void this.render();
    });

    const filtered = notes.filter((file) => {
      const query = this.noteSearch.trim().toLowerCase();
      return !query || file.path.toLowerCase().includes(query);
    });

    const list = sidebar.createDiv({ cls: "ld-vault-list" });
    filtered.forEach((file) => {
      const button = list.createEl("button", {
        cls: `ld-vault-note ${this.selectedFile?.path === file.path ? "is-active" : ""}`
      });
      button.createSpan({ cls: "ld-vault-title", text: file.basename });
      button.createSpan({ cls: "ld-vault-path", text: file.parent?.path ?? "/" });
      button.addEventListener("click", () => {
        this.selectedFile = file;
        void this.render();
      });
    });
  }

  private async renderSelectedNotePreview(
    container: HTMLElement,
    file: TFile | null,
    title: string,
    embedded = false
  ) {
    const card = embedded ? container : container.createDiv({ cls: "ld-card ld-glass ld-reading-panel" });
    if (!embedded) {
      const header = card.createDiv({ cls: "ld-card-header" });
      header.createEl("h2", { text: title });
    }

    if (!file) {
      card.createDiv({ cls: "ld-empty", text: "No Markdown note selected." });
      return;
    }

    if (embedded) {
      const header = card.createDiv({ cls: "ld-article-header" });
      header.createEl("h2", { text: file.basename });
      header.createEl("button", { cls: "ld-button", text: "Open in Obsidian" }).addEventListener("click", () => {
        void this.app.workspace.getLeaf("tab").openFile(file);
      });
    }

    const preview = card.createDiv({ cls: "ld-note-preview markdown-rendered" });
    const source = await this.app.vault.cachedRead(file);
    await MarkdownRenderer.renderMarkdown(source || "_This note is empty._", preview, file.path, this);
  }

  private renderReadingNoteEditor(container: HTMLElement) {
    const panel = container.createDiv({ cls: "ld-reading-note-panel" });
    panel.createDiv({ cls: "ld-panel-title", text: "Reading note" });
    this.readingNoteInput = panel.createEl("textarea", {
      cls: "ld-textarea",
      attr: {
        placeholder: "Write notes for the current article..."
      }
    });
    panel.createEl("button", { cls: "ld-button ld-button-primary", text: "Save note" }).addEventListener("click", () => {
      void this.saveReadingNote();
    });
  }

  private async renderNotesPage(container: HTMLElement) {
    const grid = container.createDiv({ cls: "ld-grid ld-grid-wide" });
    const left = grid.createDiv({ cls: "ld-stack ld-stack-main" });
    const right = grid.createDiv({ cls: "ld-stack ld-stack-side" });

    const card = left.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: "Reading Notes" });
    header.createEl("button", { cls: "ld-button", text: "Open file" }).addEventListener("click", async () => {
      const file = await this.getOrCreateFile(this.plugin.settings.readingNotesPath);
      void this.app.workspace.getLeaf("tab").openFile(file);
    });

    const file = await this.getOrCreateFile(this.plugin.settings.readingNotesPath);
    const source = await this.app.vault.cachedRead(file);
    const preview = card.createDiv({ cls: "ld-note-preview markdown-rendered" });
    await MarkdownRenderer.renderMarkdown(source || "_No reading notes yet._", preview, file.path, this);

    this.renderRecentNotes(right, this.getReadableNotes());
  }

  private async renderAskAiPage(container: HTMLElement, notes: TFile[]) {
    if (!this.selectedFile && notes.length > 0) {
      this.selectedFile = notes[0];
    }

    const grid = container.createDiv({ cls: "ld-grid ld-grid-wide" });
    const left = grid.createDiv({ cls: "ld-stack ld-stack-main" });
    const right = grid.createDiv({ cls: "ld-stack ld-stack-side" });

    const card = left.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: "Ask AI" });
    header.createDiv({
      cls: "ld-model-pill",
      text: this.plugin.settings.openAiModel || "No model"
    });

    const target = card.createDiv({ cls: "ld-ai-target" });
    target.createDiv({ cls: "ld-panel-title", text: "Current document" });
    target.createDiv({ cls: "ld-ai-current-file", text: this.selectedFile?.path ?? "No note selected" });

    const actions = card.createDiv({ cls: "ld-ai-actions" });
    actions.createEl("button", { cls: "ld-button ld-button-primary", text: "Summarize" }).addEventListener("click", () => {
      void this.runAiAction("summary");
    });
    actions.createEl("button", { cls: "ld-button", text: "Generate Canvas mindmap" }).addEventListener("click", () => {
      void this.runAiAction("mindmap");
    });

    const question = card.createEl("textarea", {
      cls: "ld-textarea ld-ai-question",
      attr: {
        placeholder: "Ask a question about the current document..."
      }
    });
    question.value = this.aiQuestion;
    question.addEventListener("input", () => {
      this.aiQuestion = question.value;
    });
    card.createEl("button", { cls: "ld-button ld-button-primary", text: "Ask and save" }).addEventListener("click", () => {
      void this.runAiAction("question");
    });

    if (this.aiBusy) {
      card.createDiv({ cls: "ld-empty", text: "AI is thinking..." });
    } else if (this.aiResult) {
      const result = card.createDiv({ cls: "ld-ai-result markdown-rendered" });
      await MarkdownRenderer.renderMarkdown(this.aiResult, result, this.selectedFile?.path ?? "", this);
    }

    this.renderVaultNoteList(right, notes);
  }

  private renderDashboardSettingsPage(container: HTMLElement) {
    const grid = container.createDiv({ cls: "ld-grid ld-grid-wide" });
    const left = grid.createDiv({ cls: "ld-stack ld-stack-main" });
    const right = grid.createDiv({ cls: "ld-stack ld-stack-side" });

    const paths = left.createDiv({ cls: "ld-card ld-glass" });
    paths.createEl("h2", { text: "Dashboard settings" });
    paths.createDiv({ cls: "ld-setting-row", text: `Tasks: ${this.plugin.settings.taskFilePath}` });
    paths.createDiv({ cls: "ld-setting-row", text: `Reading notes: ${this.plugin.settings.readingNotesPath}` });
    paths.createDiv({ cls: "ld-setting-row", text: `AI outputs: ${this.plugin.settings.aiOutputRoot}` });
    paths.createEl("button", { cls: "ld-button ld-button-primary", text: "Open plugin settings" }).addEventListener("click", () => {
      const setting = (this.app as App & { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
      setting?.open();
      setting?.openTabById(this.plugin.manifest.id);
    });

    const model = right.createDiv({ cls: "ld-card ld-glass" });
    model.createEl("h2", { text: "AI model" });
    model.createDiv({ cls: "ld-setting-row", text: `Base URL: ${this.plugin.settings.openAiBaseUrl || "Not set"}` });
    model.createDiv({ cls: "ld-setting-row", text: `Model: ${this.plugin.settings.openAiModel || "Not set"}` });
    model.createDiv({
      cls: "ld-setting-row",
      text: this.plugin.settings.openAiApiKey ? "API key: saved in plugin data" : "API key: not set"
    });
  }

  private renderCalendar(container: HTMLElement, tasks: DashboardTask[]) {
    const card = container.createDiv({ cls: "ld-card ld-glass ld-calendar-card" });
    const header = card.createDiv({ cls: "ld-calendar-header" });

    header.createEl("button", { cls: "ld-icon-button", text: "<" }).addEventListener("click", () => {
      this.visibleMonth = addMonths(this.visibleMonth, -1);
      void this.render();
    });

    header.createDiv({ cls: "ld-calendar-title", text: formatMonth(this.visibleMonth) });

    header.createEl("button", { cls: "ld-icon-button", text: ">" }).addEventListener("click", () => {
      this.visibleMonth = addMonths(this.visibleMonth, 1);
      void this.render();
    });

    const weekdays = card.createDiv({ cls: "ld-weekdays" });
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((day) => {
      weekdays.createDiv({ text: day });
    });

    const grid = card.createDiv({ cls: "ld-calendar-grid" });
    const first = startOfMonth(this.visibleMonth);
    const calendarStart = addDays(first, -getMondayOffset(first));

    for (let index = 0; index < 42; index += 1) {
      const day = addDays(calendarStart, index);
      const date = formatDate(day);
      const count = tasks.filter((task) => task.date === date).length;
      const cell = grid.createEl("button", {
        cls: [
          "ld-day",
          day.getMonth() === this.visibleMonth.getMonth() ? "" : "is-muted",
          date === formatDate(today()) ? "is-today" : "",
          date === this.selectedDate ? "is-selected" : ""
        ].join(" ")
      });

      cell.createSpan({ cls: "ld-day-number", text: String(day.getDate()) });
      if (count > 0) {
        cell.createSpan({ cls: "ld-day-count", text: String(count) });
      }

      cell.addEventListener("click", () => {
        this.selectedDate = date;
        this.taskScope = "today";
        this.page = "tasks";
        void this.render();
      });
    }
  }

  private renderCountdowns(container: HTMLElement) {
    const card = container.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: "Countdowns" });
    header.createEl("button", { cls: "ld-button", text: "Settings" }).addEventListener("click", () => {
      this.page = "settings";
      void this.render();
    });

    if (this.plugin.settings.countdowns.length === 0) {
      card.createDiv({ cls: "ld-empty", text: "Add important dates in settings." });
      return;
    }

    const list = card.createDiv({ cls: "ld-countdowns" });
    this.plugin.settings.countdowns
      .filter((item) => item.name.trim() && isValidDateString(item.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((item) => {
        const days = diffInDays(today(), parseDate(item.date));
        const row = list.createDiv({ cls: "ld-countdown" });
        const copy = row.createDiv();
        copy.createDiv({ cls: "ld-countdown-name", text: item.name });
        copy.createDiv({ cls: "ld-countdown-date", text: item.date });

        row.createDiv({
          cls: `ld-countdown-days ${days < 0 ? "is-past" : ""}`,
          text: days === 0 ? "Today" : days > 0 ? `${days} days` : `${Math.abs(days)} days ago`
        });
      });
  }

  private renderRecentNotes(container: HTMLElement, recentNotes: TFile[]) {
    const card = container.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: "Recent notes" });

    if (recentNotes.length === 0) {
      card.createDiv({ cls: "ld-empty", text: "No Markdown notes yet." });
      return;
    }

    const list = card.createDiv({ cls: "ld-recent-list" });
    recentNotes.slice(0, this.plugin.settings.recentNoteLimit).forEach((file) => {
      const button = list.createEl("button", { cls: "ld-recent-note" });
      button.createSpan({ cls: "ld-recent-title", text: file.basename });
      button.createSpan({ cls: "ld-recent-time", text: formatRelativeDate(new Date(file.stat.mtime)) });

      button.addEventListener("click", () => {
        this.selectedFile = file;
        this.page = "reading";
        void this.render();
      });
    });
  }

  private renderTaskFileCard(container: HTMLElement) {
    const card = container.createDiv({ cls: "ld-card ld-glass" });
    card.createEl("h2", { text: "Task storage" });
    card.createDiv({ cls: "ld-setting-row", text: this.plugin.settings.taskFilePath });
    card.createEl("button", { cls: "ld-button", text: "Open task file" }).addEventListener("click", async () => {
      const file = await this.getOrCreateFile(this.plugin.settings.taskFilePath);
      void this.app.workspace.getLeaf("tab").openFile(file);
    });
  }

  private async handleAddTask() {
    const content = this.taskInput?.value.trim() ?? "";
    const date = this.taskDateInput?.value ?? this.selectedDate;
    const time = this.taskTimeInput?.value ?? "";
    const priority = (this.taskPrioritySelect?.value as TaskPriority) ?? "normal";

    if (!content) {
      new Notice("Task content is required.");
      return;
    }

    if (!isValidDateString(date)) {
      new Notice("Please choose a valid date.");
      return;
    }

    if (time && !isValidTimeString(time)) {
      new Notice("Please choose a valid time.");
      return;
    }

    await this.appendTask(content, date, time, priority);
    new Notice("Task added.");
    await this.render();
  }

  private async appendTask(content: string, date: string, time: string, priority: TaskPriority) {
    const file = await this.getOrCreateFile(this.plugin.settings.taskFilePath);
    const marker = PRIORITY_META[priority].marker;
    const timeText = time ? ` ⏰ ${time}` : "";
    const priorityText = marker ? ` ${marker}` : "";
    const line = `- [ ] ${content} 📅 ${date}${timeText}${priorityText}`;
    const current = await this.app.vault.cachedRead(file);
    const next = current.trim().length > 0 ? `${current.trimEnd()}\n${line}\n` : `${line}\n`;
    await this.app.vault.modify(file, next);
  }

  private async toggleTask(task: DashboardTask) {
    const file = await this.getFile(this.plugin.settings.taskFilePath);
    if (!file) {
      return;
    }

    const current = await this.app.vault.cachedRead(file);
    const lines = current.split(/\r?\n/);
    const line = lines[task.line];
    if (!line) {
      return;
    }

    lines[task.line] = task.completed
      ? line.replace("- [x]", "- [ ]").replace("- [X]", "- [ ]")
      : line.replace("- [ ]", "- [x]");

    await this.app.vault.modify(file, lines.join("\n"));
    await this.render();
  }

  private async saveReadingNote() {
    const content = this.readingNoteInput?.value.trim() ?? "";
    if (!content) {
      new Notice("Write a note before saving.");
      return;
    }

    const file = await this.getOrCreateFile(this.plugin.settings.readingNotesPath);
    const sourceLink = this.selectedFile ? `[[${this.selectedFile.path}|${this.selectedFile.basename}]]` : "No source note";
    const entry = [
      `## ${formatDateTime(new Date())}`,
      "",
      `Source: ${sourceLink}`,
      "",
      content,
      ""
    ].join("\n");
    const current = await this.app.vault.cachedRead(file);
    await this.app.vault.modify(file, `${current.trimEnd()}\n\n${entry}`.trimStart());
    if (this.readingNoteInput) {
      this.readingNoteInput.value = "";
    }
    new Notice("Reading note saved.");
  }

  private async runAiAction(action: AiAction) {
    if (!this.selectedFile) {
      new Notice("Select a note first.");
      return;
    }

    if (!this.plugin.settings.openAiBaseUrl || !this.plugin.settings.openAiApiKey || !this.plugin.settings.openAiModel) {
      new Notice("Configure an OpenAI-compatible model in plugin settings first.");
      this.page = "settings";
      await this.render();
      return;
    }

    if (action === "question" && !this.aiQuestion.trim()) {
      new Notice("Ask a question first.");
      return;
    }

    this.aiBusy = true;
    this.aiResult = "";
    await this.render();

    try {
      const source = await this.app.vault.cachedRead(this.selectedFile);

      if (action === "mindmap") {
        const nodes = await this.generateMindmapNodes(source, this.selectedFile);
        const canvasPath = await this.saveMindmapCanvas(nodes, this.selectedFile);
        this.aiResult = `Canvas mindmap saved: [[${canvasPath}]]`;
        new Notice("Canvas mindmap saved.");
      } else {
        const result = await this.callAi(this.buildAiMessages(action, source, this.selectedFile));
        const savedPath = await this.saveAiMarkdown(action, result, this.selectedFile);
        this.aiResult = `${result}\n\n---\nSaved to [[${savedPath}]]`;
        new Notice("AI output saved.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.aiResult = `AI request failed: ${message}`;
      new Notice("AI request failed.");
    } finally {
      this.aiBusy = false;
      await this.render();
    }
  }

  private buildAiMessages(action: Exclude<AiAction, "mindmap">, source: string, file: TFile): AiMessage[] {
    const system = "You are an Obsidian assistant. Answer clearly in the user's language. Use concise Markdown.";
    const doc = `Document path: ${file.path}\n\nDocument content:\n${source.slice(0, 18000)}`;

    if (action === "summary") {
      return [
        { role: "system", content: system },
        { role: "user", content: `${doc}\n\nSummarize this document with key points, useful insights, and possible follow-up tasks.` }
      ];
    }

    return [
      { role: "system", content: system },
      { role: "user", content: `${doc}\n\nQuestion: ${this.aiQuestion.trim()}` }
    ];
  }

  private async generateMindmapNodes(source: string, file: TFile) {
    const messages: AiMessage[] = [
      {
        role: "system",
        content: [
          "You turn Obsidian notes into Canvas mind maps.",
          "Return strict JSON only, with no Markdown fence.",
          "The JSON must be an array of nodes.",
          "Each node must have id, label, and optional parentId.",
          "Use short stable ASCII ids. The first node should have no parentId."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          `Document path: ${file.path}`,
          "",
          "Create a concise mind map for this document.",
          "Limit it to 20 nodes unless the document truly needs more.",
          "",
          source.slice(0, 18000)
        ].join("\n")
      }
    ];

    const result = await this.callAi(messages);
    return parseMindmapJson(result);
  }

  private async callAi(messages: AiMessage[]) {
    const base = this.plugin.settings.openAiBaseUrl.replace(/\/+$/, "");
    const response = await requestUrl({
      url: `${base}/chat/completions`,
      method: "POST",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${this.plugin.settings.openAiApiKey}`
      },
      body: JSON.stringify({
        model: this.plugin.settings.openAiModel,
        messages,
        temperature: 0.3
      })
    });

    const json = response.json as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (json.error?.message) {
      throw new Error(json.error.message);
    }

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("The model returned an empty response.");
    }
    return content;
  }

  private async saveAiMarkdown(action: Exclude<AiAction, "mindmap">, content: string, sourceFile: TFile) {
    const folder = await this.ensureAiDocumentFolder(sourceFile);
    const fileName = action === "summary" ? "summary.md" : `question-${slugify(formatDateTime(new Date()))}.md`;
    const path = `${folder}/${fileName}`;
    const body = [
      `# ${action === "summary" ? "AI Summary" : "AI Question"}`,
      "",
      `Source: [[${sourceFile.path}|${sourceFile.basename}]]`,
      "",
      action === "question" ? `Question: ${this.aiQuestion.trim()}\n` : "",
      content,
      ""
    ].join("\n");

    await this.writeFile(path, body);
    await this.appendBacklink(sourceFile, path, action === "summary" ? "AI summary" : "AI question");
    return path;
  }

  private async saveMindmapCanvas(nodes: MindmapNode[], sourceFile: TFile) {
    const folder = await this.ensureAiDocumentFolder(sourceFile);
    const path = `${folder}/mindmap.canvas`;
    const canvas = buildCanvas(nodes, sourceFile.path);

    await this.writeFile(path, JSON.stringify(canvas, null, 2));
    await this.appendBacklink(sourceFile, path, "AI Canvas mindmap");
    return path;
  }

  private async ensureAiDocumentFolder(sourceFile: TFile) {
    const root = normalizePath(this.plugin.settings.aiOutputRoot || DEFAULT_SETTINGS.aiOutputRoot);
    const folder = normalizePath(`${root}/${sanitizePathSegment(sourceFile.basename)}`);
    await ensureFolderPath(this.app, folder);
    return folder;
  }

  private async appendBacklink(sourceFile: TFile, outputPath: string, label: string) {
    const current = await this.app.vault.cachedRead(sourceFile);
    const link = `- ${label}: [[${outputPath}]]`;
    if (current.includes(link)) {
      return;
    }

    const section = current.includes("## AI Outputs")
      ? `${current.trimEnd()}\n${link}\n`
      : `${current.trimEnd()}\n\n## AI Outputs\n${link}\n`;
    await this.app.vault.modify(sourceFile, section);
  }

  private async loadTasks(): Promise<DashboardTask[]> {
    const file = await this.getFile(this.plugin.settings.taskFilePath);
    if (!file) {
      return [];
    }

    const source = await this.app.vault.cachedRead(file);
    return source
      .split(/\r?\n/)
      .map((line, index) => parseTaskLine(line, index))
      .filter((task): task is DashboardTask => task !== null)
      .sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }

        const aDateTime = `${a.date} ${a.time || "23:59"}`;
        const bDateTime = `${b.date} ${b.time || "23:59"}`;
        if (aDateTime !== bDateTime) {
          return aDateTime.localeCompare(bDateTime);
        }

        return PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank;
      });
  }

  private getVisibleTasks(tasks: DashboardTask[]) {
    if (this.taskScope === "today") {
      return this.getTasksForRange(tasks, this.selectedDate, this.selectedDate);
    }

    if (this.taskScope === "week") {
      const selected = parseDate(this.selectedDate);
      const start = addDays(selected, -getMondayOffset(selected));
      return this.getTasksForRange(tasks, formatDate(start), formatDate(addDays(start, 6)));
    }

    return this.getTasksForRange(tasks, formatDate(today()), formatDate(addDays(today(), 6)));
  }

  private getTasksForRange(tasks: DashboardTask[], from: string, to: string) {
    return tasks.filter((task) => task.date >= from && task.date <= to);
  }

  private isTaskOverdue(task: DashboardTask) {
    const now = new Date();
    const taskDateTime = parseDateTime(task.date, task.time || "23:59");
    return taskDateTime.getTime() < now.getTime();
  }

  private getReadableNotes() {
    const hidden = new Set([
      normalizePath(this.plugin.settings.taskFilePath),
      normalizePath(this.plugin.settings.readingNotesPath)
    ]);

    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => !hidden.has(normalizePath(file.path)))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private async getFile(path: string) {
    const normalizedPath = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    return file instanceof TFile ? file : null;
  }

  private async getOrCreateFile(path: string) {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (existing instanceof TFile) {
      return existing;
    }

    await ensureParentFolder(this.app, normalizedPath);
    return this.app.vault.create(normalizedPath, "");
  }

  private async writeFile(path: string, content: string) {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    await ensureParentFolder(this.app, normalizedPath);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }

    return this.app.vault.create(normalizedPath, content);
  }
}

class LiquidDashboardSettingTab extends PluginSettingTab {
  plugin: LiquidDashboardPlugin;

  constructor(app: App, plugin: LiquidDashboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("liquid-dashboard-settings");

    containerEl.createEl("h2", { text: "Liquid Dashboard Home" });

    new Setting(containerEl)
      .setName("Task file")
      .setDesc("All dashboard tasks are saved in this Markdown file.")
      .addText((text) =>
        text
          .setPlaceholder("Dashboard/Tasks.md")
          .setValue(this.plugin.settings.taskFilePath)
          .onChange(async (value) => {
            this.plugin.settings.taskFilePath = normalizePath(value || DEFAULT_SETTINGS.taskFilePath);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reading notes file")
      .setDesc("Notes written in the reading pane are appended here.")
      .addText((text) =>
        text
          .setPlaceholder("Dashboard/Reading Notes.md")
          .setValue(this.plugin.settings.readingNotesPath)
          .onChange(async (value) => {
            this.plugin.settings.readingNotesPath = normalizePath(value || DEFAULT_SETTINGS.readingNotesPath);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("AI output root folder")
      .setDesc("Each source document gets a same-named folder under this root.")
      .addText((text) =>
        text
          .setPlaceholder("AI Outputs")
          .setValue(this.plugin.settings.aiOutputRoot)
          .onChange(async (value) => {
            this.plugin.settings.aiOutputRoot = normalizePath(value || DEFAULT_SETTINGS.aiOutputRoot);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Open dashboard on startup")
      .setDesc("Show the dashboard when Obsidian finishes loading.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoOpenDashboard)
          .onChange(async (value) => {
            this.plugin.settings.autoOpenDashboard = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Recent note count")
      .setDesc("How many recent notes are shown on the home page.")
      .addSlider((slider) =>
        slider
          .setLimits(3, 20, 1)
          .setValue(this.plugin.settings.recentNoteLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.recentNoteLimit = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "OpenAI-compatible model" });

    new Setting(containerEl)
      .setName("API base URL")
      .setDesc("Example: https://api.openai.com/v1 or another OpenAI-compatible endpoint.")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.openAiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.openAiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Saved in this plugin's Obsidian data. It is convenient, not strongly encrypted.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.openAiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openAiApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Any model name accepted by your OpenAI-compatible provider.")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.openAiModel)
          .onChange(async (value) => {
            this.plugin.settings.openAiModel = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Countdowns" });
    containerEl.createDiv({
      cls: "setting-item-description",
      text: "Add a name and date. The dashboard calculates days from the system date."
    });

    this.plugin.settings.countdowns.forEach((item, index) => {
      const setting = new Setting(containerEl)
        .setName(`Countdown ${index + 1}`)
        .addText((text) =>
          text
            .setPlaceholder("Name")
            .setValue(item.name)
            .onChange(async (value) => {
              this.plugin.settings.countdowns[index].name = value;
              await this.plugin.saveSettings();
            })
        )
        .addText((text) =>
          text
            .setPlaceholder("YYYY-MM-DD")
            .setValue(item.date)
            .onChange(async (value) => {
              this.plugin.settings.countdowns[index].date = value;
              await this.plugin.saveSettings();
            })
        )
        .addButton((button) =>
          button
            .setButtonText("Delete")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.countdowns.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            })
        );

      setting.settingEl.addClass("ld-countdown-setting");
    });

    new Setting(containerEl)
      .addButton((button) =>
        button
          .setButtonText("Add countdown")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.countdowns.push({
              name: "New countdown",
              date: formatDate(addDays(today(), 1))
            });
            await this.plugin.saveSettings();
            this.display();
          })
      );
  }
}

function parseTaskLine(line: string, index: number): DashboardTask | null {
  const taskMatch = line.match(/^\s*-\s+\[([ xX])\]\s+(.+?)\s+📅\s+(\d{4}-\d{2}-\d{2})(.*)$/);
  if (!taskMatch) {
    return null;
  }

  const tail = taskMatch[4] ?? "";
  const timeMatch = tail.match(/⏰\s+(\d{2}:\d{2})/);
  const content = taskMatch[2].trim();

  return {
    completed: taskMatch[1].toLowerCase() === "x",
    content,
    date: taskMatch[3],
    time: timeMatch?.[1] ?? "",
    priority: parsePriority(tail),
    line: index,
    raw: line
  };
}

function parsePriority(source: string): TaskPriority {
  if (source.includes("⏫") || source.includes("🔺")) {
    return "high";
  }

  if (source.includes("🔼")) {
    return "medium";
  }

  if (source.includes("🔽") || source.includes("⏬")) {
    return "low";
  }

  return "normal";
}

async function ensureParentFolder(app: App, filePath: string) {
  const parts = normalizePath(filePath).split("/");
  parts.pop();
  await ensureFolderPath(app, parts.join("/"));
}

async function ensureFolderPath(app: App, folderPath: string) {
  const normalized = normalizePath(folderPath);
  if (!normalized) {
    return;
  }

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

async function callOpenAiCompatible(settings: DashboardSettings, messages: AiMessage[]) {
  const base = settings.openAiBaseUrl.replace(/\/+$/, "");
  const response = await requestUrl({
    url: `${base}/chat/completions`,
    method: "POST",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${settings.openAiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openAiModel,
      messages,
      temperature: 0.3
    })
  });

  const json = response.json as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (json.error?.message) {
    throw new Error(json.error.message);
  }

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("The model returned an empty response.");
  }
  return content;
}

function buildCanvas(nodes: MindmapNode[], sourcePath: string) {
  const canvasNodes: Array<Record<string, string | number>> = [
    {
      id: "source-note",
      type: "file",
      file: sourcePath,
      x: -360,
      y: 0,
      width: 260,
      height: 120
    }
  ];
  const edges: Array<Record<string, string>> = [];
  const levels = new Map<string, number>();
  const siblingCount = new Map<number, number>();

  nodes.forEach((node, index) => {
    const parentLevel = node.parentId ? levels.get(node.parentId) ?? 0 : -1;
    const level = parentLevel + 1;
    levels.set(node.id, level);
    const siblingIndex = siblingCount.get(level) ?? 0;
    siblingCount.set(level, siblingIndex + 1);

    canvasNodes.push({
      id: node.id,
      type: "text",
      text: node.label,
      x: level * 320,
      y: siblingIndex * 150 - 220,
      width: 240,
      height: 96
    });

    edges.push({
      id: `edge-${index}`,
      fromNode: node.parentId ?? "source-note",
      toNode: node.id
    });
  });

  return {
    nodes: canvasNodes,
    edges
  };
}

function parseMindmapJson(source: string): MindmapNode[] {
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced?.[1] ?? source;
  const parsed = JSON.parse(jsonText) as MindmapNode[];
  return parsed
    .filter((node) => node.id && node.label)
    .slice(0, 40)
    .map((node, index) => ({
      id: slugify(node.id || `node-${index}`),
      label: String(node.label).slice(0, 180),
      parentId: node.parentId ? slugify(node.parentId) : undefined
    }));
}

function today() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

function isValidDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value).getTime());
}

function isValidTimeString(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatDateTime(date: Date) {
  return `${formatDate(date)} ${formatTime(date)}`;
}

function formatReadableDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return startOfMonth(next);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMondayOffset(date: Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function diffInDays(from: Date, to: Date) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.ceil((to.getTime() - from.getTime()) / oneDay);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) {
    return "Late night, plan gently";
  }
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

function formatRelativeDate(date: Date) {
  const days = diffInDays(today(), new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  if (days === 0) {
    return "Today";
  }
  if (days === -1) {
    return "Yesterday";
  }
  if (days > -7 && days < 0) {
    return `${Math.abs(days)} days ago`;
  }
  return formatShortDate(date);
}

function sanitizePathSegment(value: string) {
  return value.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim() || "Untitled";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `node-${Math.random().toString(36).slice(2, 8)}`;
}
