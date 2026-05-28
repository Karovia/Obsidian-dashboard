import {
  App,
  ItemView,
  MarkdownView,
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
type DashboardLanguage = "zh" | "en";
type AiProvider = "openai" | "claudeCodeCli";
type TranslationKey = keyof typeof TEXT.en;

interface CountdownItem {
  name: string;
  date: string;
}

interface DashboardSettings {
  language: DashboardLanguage;
  taskFilePath: string;
  readingNotesPath: string;
  aiOutputRoot: string;
  autoOpenDashboard: boolean;
  autoCheckUpdates: boolean;
  updateRepo: string;
  updateBranch: string;
  recentNoteLimit: number;
  aiProvider: AiProvider;
  openAiBaseUrl: string;
  openAiApiKey: string;
  openAiModel: string;
  claudeCliCommand: string;
  claudeCliMaxTurns: number;
  claudeCliTimeoutSeconds: number;
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

interface FloatingAiContext {
  file: TFile | null;
  selectedText: string;
  fullText: string;
  prompt: string;
}

interface NoteTreeNode {
  name: string;
  path: string;
  type: "folder" | "file";
  children: NoteTreeNode[];
  file?: TFile;
}

interface CountdownDisplayItem {
  name: string;
  date: string;
  time?: string;
  source: "manual" | "task";
}

const TEXT = {
  en: {
    navHome: "Home",
    navTasks: "Tasks",
    navReading: "Reading",
    navNotes: "Notes",
    navAskAi: "Ask AI",
    floatingAskAi: "Ask AI",
    floatingAskPlaceholder: "Ask about the selected text or current note...",
    floatingNoContext: "Select text or open a Markdown note first.",
    floatingRun: "Ask",
    floatingSave: "Save",
    floatingClose: "Close",
    floatingContextSelection: "Selection",
    floatingContextDocument: "Current note",
    floatingSaved: "AI answer saved.",
    floatingEmptyAnswer: "There is no answer to save.",
    floatingStop: "Stop",
    navSettings: "Settings",
    openDashboard: "Open Liquid Dashboard",
    today: "Today",
    next7Days: "Next 7 days",
    overdue: "Overdue",
    heroSubtitle: "Review today, then shape the next seven days.",
    quickAddTask: "Quick add task",
    taskContentPlaceholder: "Task content",
    add: "Add",
    tasks: "Tasks",
    thisWeek: "This week",
    noTasksInRange: "No tasks in this range yet.",
    reading: "Reading",
    showNotes: "Show notes",
    hideNotes: "Hide notes",
    allNotes: "All notes",
    searchNotes: "Search notes",
    noMarkdownSelected: "No Markdown note selected.",
    openInObsidian: "Open in Obsidian",
    readingNote: "Reading note",
    readingNotePlaceholder: "Write notes for the current article...",
    saveNote: "Save note",
    readingNotes: "Reading Notes",
    openFile: "Open file",
    noReadingNotes: "_No reading notes yet._",
    askAi: "Ask AI",
    noModel: "No model",
    currentDocument: "Current document",
    noNoteSelected: "No note selected",
    summarize: "Summarize",
    generateMindmap: "Generate Canvas mindmap",
    askQuestionPlaceholder: "Ask a question about the current document...",
    askAndSave: "Ask and save",
    aiThinking: "AI is thinking...",
    dashboardSettings: "Dashboard settings",
    taskPathLabel: "Tasks",
    readingNotesPathLabel: "Reading notes",
    aiOutputsPathLabel: "AI outputs",
    openPluginSettings: "Open plugin settings",
    aiModel: "AI model",
    notSet: "Not set",
    apiKeySaved: "API key: saved in plugin data",
    apiKeyNotSet: "API key: not set",
    countdowns: "Countdowns",
    settings: "Settings",
    addDatesInSettings: "Add important dates in settings.",
    days: "days",
    daysAgo: "days ago",
    recentNotes: "Recent notes",
    noMarkdownNotes: "No Markdown notes yet.",
    taskStorage: "Task storage",
    openTaskFile: "Open task file",
    taskContentRequired: "Task content is required.",
    chooseValidDate: "Please choose a valid date.",
    chooseValidTime: "Please choose a valid time.",
    taskAdded: "Task added.",
    writeNoteBeforeSaving: "Write a note before saving.",
    noSourceNote: "No source note",
    source: "Source",
    readingNoteSaved: "Reading note saved.",
    selectNoteFirst: "Select a note first.",
    configureAiFirst: "Configure an OpenAI-compatible model in plugin settings first.",
    askQuestionFirst: "Ask a question first.",
    canvasMindmapSaved: "Canvas mindmap saved.",
    aiOutputSaved: "AI output saved.",
    aiRequestFailed: "AI request failed.",
    aiSummary: "AI Summary",
    aiQuestion: "AI Question",
    question: "Question",
    aiOutputsHeading: "AI Outputs",
    aiSummaryLink: "AI summary",
    aiQuestionLink: "AI question",
    aiMindmapLink: "AI Canvas mindmap",
    priorityHigh: "High",
    priorityMedium: "Medium",
    priorityNormal: "Normal",
    priorityLow: "Low",
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
    language: "Language",
    languageDesc: "Switch all dashboard and settings text.",
    languageZh: "Chinese",
    languageEn: "English",
    taskFile: "Task file",
    taskFileDesc: "All dashboard tasks are saved in this Markdown file.",
    readingNotesFile: "Reading notes file",
    readingNotesFileDesc: "Notes written in the reading pane are appended here.",
    aiOutputRoot: "AI output root folder",
    aiOutputRootDesc: "Each source document gets a same-named folder under this root.",
    openOnStartup: "Open dashboard on startup",
    openOnStartupDesc: "Show the dashboard when Obsidian finishes loading.",
    recentNoteCount: "Recent note count",
    recentNoteCountDesc: "How many recent notes are shown on the home page.",
    defaultAiService: "Default AI service",
    defaultAiServiceDesc: "Choose which service Ask AI uses by default.",
    openAiCompatibleModel: "OpenAI-compatible model",
    aiProvider: "AI provider",
    aiProviderDesc: "Choose between remote OpenAI-compatible APIs and the local Claude Code CLI.",
    providerOpenAi: "OpenAI-compatible",
    providerClaudeCli: "Claude Code CLI",
    apiBaseUrl: "API base URL",
    apiBaseUrlDesc: "Example: https://api.openai.com/v1 or another OpenAI-compatible endpoint.",
    apiKey: "API key",
    apiKeyDesc: "Saved in this plugin's Obsidian data. It is convenient, not strongly encrypted.",
    model: "Model",
    modelDesc: "Any model name accepted by your OpenAI-compatible provider.",
    claudeCliSettings: "Claude Code CLI",
    claudeCliCommand: "Claude command",
    claudeCliCommandDesc: "Command used to run Claude Code CLI. Use claude if it is already on PATH.",
    claudeCliMaxTurns: "Max turns",
    claudeCliMaxTurnsDesc: "Limits how many agent turns Claude Code can take.",
    claudeCliTimeout: "Timeout seconds",
    claudeCliTimeoutDesc: "Stop the CLI request after this many seconds.",
    claudeCliDesktopOnly: "Claude Code CLI can only be used in Obsidian desktop.",
    configureClaudeCliFirst: "Configure Claude Code CLI in plugin settings first.",
    updateSettings: "Remote updates",
    updateRepo: "GitHub repository",
    updateRepoDesc: "Repository used for plugin updates, in owner/name format.",
    updateBranch: "Update branch",
    updateBranchDesc: "Branch to read manifest.json, main.js, and styles.css from.",
    autoCheckUpdates: "Check updates on startup",
    autoCheckUpdatesDesc: "Shows a notice when a newer remote version is available.",
    checkAndInstallUpdate: "Check and install update",
    updateChecking: "Checking remote update...",
    updateAlreadyLatest: "Already on the latest version.",
    updateAvailable: "Update available",
    updateInstalled: "Update installed. Restart Obsidian or reload plugins to apply it.",
    updateFailed: "Update failed.",
    fromTask: "Task",
    countdownsDesc: "Add a name and date. The dashboard calculates days from the system date.",
    countdown: "Countdown",
    name: "Name",
    delete: "Delete",
    addCountdown: "Add countdown",
    newCountdown: "New countdown",
    greetingLate: "Late night, plan gently",
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    yesterday: "Yesterday"
  },
  zh: {
    navHome: "首页",
    navTasks: "任务",
    navReading: "阅读",
    navNotes: "笔记",
    navAskAi: "Ask AI",
    floatingAskAi: "Ask AI",
    floatingAskPlaceholder: "针对选中文本或当前笔记提问...",
    floatingNoContext: "请先选中文本，或打开一篇 Markdown 笔记。",
    floatingRun: "提问",
    floatingSave: "保存",
    floatingClose: "关闭",
    floatingContextSelection: "选中文本",
    floatingContextDocument: "当前笔记",
    floatingSaved: "AI 回答已保存。",
    floatingEmptyAnswer: "还没有可保存的回答。",
    floatingStop: "停止",
    navSettings: "设置",
    openDashboard: "打开 Liquid Dashboard",
    today: "今天",
    next7Days: "未来 7 天",
    overdue: "已逾期",
    heroSubtitle: "先看今天，再安排接下来的一周。",
    quickAddTask: "快速添加任务",
    taskContentPlaceholder: "任务内容",
    add: "添加",
    tasks: "任务",
    thisWeek: "本周",
    noTasksInRange: "这个时间段还没有任务。",
    reading: "阅读",
    showNotes: "显示笔记",
    hideNotes: "隐藏笔记",
    allNotes: "全部笔记",
    searchNotes: "搜索笔记",
    noMarkdownSelected: "还没有选择 Markdown 笔记。",
    openInObsidian: "在 Obsidian 中打开",
    readingNote: "阅读笔记",
    readingNotePlaceholder: "为当前文章写一点笔记...",
    saveNote: "保存笔记",
    readingNotes: "阅读笔记",
    openFile: "打开文件",
    noReadingNotes: "_还没有阅读笔记。_",
    askAi: "Ask AI",
    noModel: "未设置模型",
    currentDocument: "当前文档",
    noNoteSelected: "未选择笔记",
    summarize: "总结",
    generateMindmap: "生成 Canvas 思维导图",
    askQuestionPlaceholder: "针对当前文档提问...",
    askAndSave: "提问并保存",
    aiThinking: "AI 正在思考...",
    dashboardSettings: "Dashboard 设置",
    taskPathLabel: "任务",
    readingNotesPathLabel: "阅读笔记",
    aiOutputsPathLabel: "AI 输出",
    openPluginSettings: "打开插件设置",
    aiModel: "AI 模型",
    notSet: "未设置",
    apiKeySaved: "API key：已保存在插件数据中",
    apiKeyNotSet: "API key：未设置",
    countdowns: "倒计时",
    settings: "设置",
    addDatesInSettings: "在设置里添加重要日期。",
    days: "天",
    daysAgo: "天前",
    recentNotes: "最近笔记",
    noMarkdownNotes: "还没有 Markdown 笔记。",
    taskStorage: "任务存储",
    openTaskFile: "打开任务文件",
    taskContentRequired: "请先输入任务内容。",
    chooseValidDate: "请选择有效日期。",
    chooseValidTime: "请选择有效时间。",
    taskAdded: "任务已添加。",
    writeNoteBeforeSaving: "请先写一点笔记。",
    noSourceNote: "无来源笔记",
    source: "来源",
    readingNoteSaved: "阅读笔记已保存。",
    selectNoteFirst: "请先选择一篇笔记。",
    configureAiFirst: "请先在插件设置里配置 OpenAI-compatible 模型。",
    askQuestionFirst: "请先输入问题。",
    canvasMindmapSaved: "Canvas 思维导图已保存。",
    aiOutputSaved: "AI 输出已保存。",
    aiRequestFailed: "AI 请求失败。",
    aiSummary: "AI 总结",
    aiQuestion: "AI 问答",
    question: "问题",
    aiOutputsHeading: "AI 输出",
    aiSummaryLink: "AI 总结",
    aiQuestionLink: "AI 问答",
    aiMindmapLink: "AI Canvas 思维导图",
    priorityHigh: "高",
    priorityMedium: "中",
    priorityNormal: "普通",
    priorityLow: "低",
    monday: "一",
    tuesday: "二",
    wednesday: "三",
    thursday: "四",
    friday: "五",
    saturday: "六",
    sunday: "日",
    language: "语言",
    languageDesc: "切换整个 Dashboard 和设置页的显示语言。",
    languageZh: "中文",
    languageEn: "英文",
    taskFile: "任务文件",
    taskFileDesc: "所有 Dashboard 任务都会保存到这个 Markdown 文件。",
    readingNotesFile: "阅读笔记文件",
    readingNotesFileDesc: "阅读面板里写的笔记会追加保存到这里。",
    aiOutputRoot: "AI 输出根目录",
    aiOutputRootDesc: "每篇源文档会在这个目录下创建一个同名文件夹。",
    openOnStartup: "启动时自动打开 Dashboard",
    openOnStartupDesc: "Obsidian 加载完成后显示 Dashboard。",
    recentNoteCount: "最近笔记数量",
    recentNoteCountDesc: "首页显示多少篇最近笔记。",
    defaultAiService: "默认 AI 服务",
    defaultAiServiceDesc: "选择 Ask AI 默认使用哪个服务。",
    openAiCompatibleModel: "OpenAI-compatible 模型",
    aiProvider: "AI 提供方",
    aiProviderDesc: "选择远程 OpenAI-compatible API，或调用本机 Claude Code CLI。",
    providerOpenAi: "OpenAI-compatible",
    providerClaudeCli: "Claude Code CLI",
    apiBaseUrl: "API Base URL",
    apiBaseUrlDesc: "例如：https://api.openai.com/v1，也可以填写其他兼容端点。",
    apiKey: "API Key",
    apiKeyDesc: "保存在 Obsidian 插件数据里，方便使用，但不是强加密。",
    model: "模型",
    modelDesc: "填写你的 OpenAI-compatible 服务支持的模型名。",
    claudeCliSettings: "Claude Code CLI",
    claudeCliCommand: "Claude 命令",
    claudeCliCommandDesc: "用于运行 Claude Code CLI 的命令。如果已经加入 PATH，填 claude 即可。",
    claudeCliMaxTurns: "最大轮数",
    claudeCliMaxTurnsDesc: "限制 Claude Code 最多执行多少轮 agent 操作。",
    claudeCliTimeout: "超时时间（秒）",
    claudeCliTimeoutDesc: "超过这个时间后停止 CLI 请求。",
    claudeCliDesktopOnly: "Claude Code CLI 只能在 Obsidian 桌面端使用。",
    configureClaudeCliFirst: "请先在插件设置里配置 Claude Code CLI。",
    updateSettings: "远程更新",
    updateRepo: "GitHub 仓库",
    updateRepoDesc: "用于更新插件的仓库，格式为 owner/name。",
    updateBranch: "更新分支",
    updateBranchDesc: "从这个分支读取 manifest.json、main.js 和 styles.css。",
    autoCheckUpdates: "启动时检查更新",
    autoCheckUpdatesDesc: "发现远程版本更新时显示提示。",
    checkAndInstallUpdate: "检查并安装更新",
    updateChecking: "正在检查远程更新...",
    updateAlreadyLatest: "当前已经是最新版本。",
    updateAvailable: "发现新版本",
    updateInstalled: "更新已安装。请重启 Obsidian 或重新加载插件后生效。",
    updateFailed: "更新失败。",
    fromTask: "任务",
    countdownsDesc: "添加名称和日期，Dashboard 会根据系统日期自动计算剩余天数。",
    countdown: "倒计时",
    name: "名称",
    delete: "删除",
    addCountdown: "添加倒计时",
    newCountdown: "新的倒计时",
    greetingLate: "夜深了，轻一点安排",
    greetingMorning: "早上好",
    greetingAfternoon: "下午好",
    greetingEvening: "晚上好",
    yesterday: "昨天"
  }
} as const;

const DEFAULT_SETTINGS: DashboardSettings = {
  language: "zh",
  taskFilePath: "Dashboard/Tasks.md",
  readingNotesPath: "Dashboard/Reading Notes.md",
  aiOutputRoot: "AI Outputs",
  autoOpenDashboard: true,
  autoCheckUpdates: true,
  updateRepo: "Karovia/Obsidian-dashboard",
  updateBranch: "main",
  recentNoteLimit: 8,
  aiProvider: "openai",
  openAiBaseUrl: "https://api.openai.com/v1",
  openAiApiKey: "",
  openAiModel: "gpt-4o-mini",
  claudeCliCommand: "claude",
  claudeCliMaxTurns: 3,
  claudeCliTimeoutSeconds: 120,
  countdowns: [
    {
      name: "示例截止日",
      date: formatDate(addDays(today(), 7))
    }
  ]
};

const PRIORITY_META: Record<TaskPriority, { labelKey: TranslationKey; marker: string; rank: number }> = {
  high: { labelKey: "priorityHigh", marker: "⏫", rank: 3 },
  medium: { labelKey: "priorityMedium", marker: "🔼", rank: 2 },
  normal: { labelKey: "priorityNormal", marker: "", rank: 1 },
  low: { labelKey: "priorityLow", marker: "🔽", rank: 0 }
};

const PAGE_META: Array<{ id: DashboardPage; labelKey: TranslationKey }> = [
  { id: "home", labelKey: "navHome" },
  { id: "tasks", labelKey: "navTasks" },
  { id: "reading", labelKey: "navReading" },
  { id: "notes", labelKey: "navNotes" },
  { id: "askai", labelKey: "navAskAi" },
  { id: "settings", labelKey: "navSettings" }
];

export default class LiquidDashboardPlugin extends Plugin {
  settings: DashboardSettings;
  private floatingAssistant: FloatingAiAssistant | null = null;

  async onload() {
    await this.loadSettings();

    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new LiquidDashboardView(leaf, this)
    );

    this.addRibbonIcon("layout-dashboard", this.t("openDashboard"), () => {
      void this.activateDashboard();
    });

    this.addCommand({
      id: "open-liquid-dashboard",
      name: this.t("openDashboard"),
      callback: () => {
        void this.activateDashboard();
      }
    });

    this.addCommand({
      id: "open-floating-ai-assistant",
      name: this.t("floatingAskAi"),
      callback: () => {
        this.floatingAssistant?.openPanel();
      }
    });

    this.addSettingTab(new LiquidDashboardSettingTab(this.app, this));
    this.floatingAssistant = new FloatingAiAssistant(this);
    this.floatingAssistant.mount();

    if (this.settings.autoOpenDashboard) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateDashboard();
      });
    }

    if (this.settings.autoCheckUpdates) {
      this.app.workspace.onLayoutReady(() => {
        window.setTimeout(() => {
          void this.checkForUpdate(false).catch(() => undefined);
        }, 3500);
      });
    }
  }

  onunload() {
    this.floatingAssistant?.unmount();
    this.floatingAssistant = null;
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
    this.settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, await this.loadData()));
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

  t(key: TranslationKey) {
    return translate(this.settings.language, key);
  }

  async checkForUpdate(install: boolean) {
    const remoteManifest = await this.fetchRemoteText("manifest.json");
    const manifest = JSON.parse(remoteManifest) as { version?: string };
    const remoteVersion = manifest.version ?? "0.0.0";

    if (compareVersions(remoteVersion, this.manifest.version) <= 0) {
      if (install) {
        new Notice(this.t("updateAlreadyLatest"));
      }
      return false;
    }

    if (!install) {
      new Notice(`${this.t("updateAvailable")}: ${remoteVersion}`);
      return true;
    }

    await this.installRemoteUpdate(remoteManifest);
    new Notice(this.t("updateInstalled"));
    return true;
  }

  private async installRemoteUpdate(remoteManifest: string) {
    const [mainJs, stylesCss] = await Promise.all([
      this.fetchRemoteText("main.js"),
      this.fetchRemoteText("styles.css")
    ]);
    const pluginDir = this.getPluginDir();
    await this.app.vault.adapter.write(normalizePath(`${pluginDir}/manifest.json`), remoteManifest);
    await this.app.vault.adapter.write(normalizePath(`${pluginDir}/main.js`), mainJs);
    await this.app.vault.adapter.write(normalizePath(`${pluginDir}/styles.css`), stylesCss);
  }

  private async fetchRemoteText(fileName: string) {
    const repo = this.settings.updateRepo.trim() || DEFAULT_SETTINGS.updateRepo;
    const branch = this.settings.updateBranch.trim() || DEFAULT_SETTINGS.updateBranch;
    const response = await requestUrl({
      url: `https://raw.githubusercontent.com/${repo}/${branch}/${fileName}`,
      method: "GET"
    });
    return response.text;
  }

  private getPluginDir() {
    return (this.manifest as { dir?: string }).dir ?? normalizePath(`.obsidian/plugins/${this.manifest.id}`);
  }

  getActiveFloatingContext(): FloatingAiContext | null {
    const activeLeaf = (this.app.workspace as { activeLeaf?: WorkspaceLeaf | null }).activeLeaf;
    if (activeLeaf?.view instanceof LiquidDashboardView) {
      const dashboardContext = activeLeaf.view.getFloatingContextFromDashboard();
      if (dashboardContext) {
        return dashboardContext;
      }
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      const domSelection = getDomSelectionText();
      if (!domSelection) {
        return null;
      }
      return {
        file: this.app.workspace.getActiveFile(),
        selectedText: domSelection,
        fullText: domSelection,
        prompt: domSelection
      };
    }

    const file = view.file;
    const selectedText = view.editor.getSelection().trim() || getDomSelectionText();
    const fullText = view.editor.getValue();
    const contextText = selectedText || fullText;
    if (!contextText.trim()) {
      return null;
    }

    return {
      file,
      selectedText,
      fullText,
      prompt: contextText
    };
  }

  async callAi(messages: AiMessage[], onChunk?: (chunk: string) => void, signal?: AbortSignal) {
    if (this.settings.aiProvider === "claudeCodeCli") {
      return callClaudeCodeCli(this.settings, messages, onChunk, signal);
    }
    const content = await callOpenAiCompatible(this.settings, messages);
    onChunk?.(content);
    return content;
  }

  buildFloatingMessages(question: string, context: FloatingAiContext): AiMessage[] {
    const system = this.settings.language === "zh"
      ? "你是 Obsidian Dashboard 里的 AI 助手。必须优先基于 <context> 中的内容回答，不要泛泛寒暄。如果用户要求创建日程或任务，请给出可直接执行的任务清单、日期和时间建议。回答要清晰、实用、简洁。"
      : "You are an AI assistant inside an Obsidian Dashboard. Ground your answer in the <context> content first and do not reply with generic greetings. If the user asks to create schedules or tasks, provide actionable task items with date and time suggestions. Be clear, useful, and concise.";
    const contextLabel = context.selectedText ? this.t("floatingContextSelection") : this.t("floatingContextDocument");
    const fileLine = context.file ? `File: ${context.file.path}` : "File: unknown";
    return [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          fileLine,
          `Context type: ${contextLabel}`,
          "",
          "<context>",
          context.prompt.slice(0, 20000),
          "</context>",
          "",
          `Question: ${question}`
        ].join("\n")
      }
    ];
  }

  async saveFloatingAiAnswer(answer: string, question: string, context: FloatingAiContext) {
    if (!answer.trim()) {
      new Notice(this.t("floatingEmptyAnswer"));
      return "";
    }

    const folder = await this.ensureAiDocumentFolder(context.file);
    const path = `${folder}/floating-${slugify(formatDateTime(new Date()))}.md`;
    const sourceLine = context.file ? `${this.t("source")}: [[${context.file.path}|${context.file.basename}]]` : `${this.t("source")}: Floating Assistant`;
    const body = [
      `# ${this.t("floatingAskAi")}`,
      "",
      sourceLine,
      "",
      `${this.t("question")}: ${question}`,
      "",
      answer,
      ""
    ].join("\n");
    await this.writeVaultFile(path, body);

    if (context.file) {
      await this.appendBacklink(context.file, path, this.t("floatingAskAi"));
    }
    new Notice(this.t("floatingSaved"));
    return path;
  }

  private async ensureAiDocumentFolder(sourceFile: TFile | null) {
    const root = normalizePath(this.settings.aiOutputRoot || DEFAULT_SETTINGS.aiOutputRoot);
    const folderName = sourceFile ? sanitizePathSegment(sourceFile.basename) : "Floating Assistant";
    const folder = normalizePath(`${root}/${folderName}`);
    await ensureFolderPath(this.app, folder);
    return folder;
  }

  private async writeVaultFile(path: string, content: string) {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    await ensureParentFolder(this.app, normalizedPath);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    return this.app.vault.create(normalizedPath, content);
  }

  private async appendBacklink(sourceFile: TFile, outputPath: string, label: string) {
    const current = await this.app.vault.cachedRead(sourceFile);
    const heading = `## ${this.t("aiOutputsHeading")}`;
    const link = `- ${label}: [[${outputPath}]]`;
    if (current.includes(link)) {
      return;
    }

    const section = current.includes(heading)
      ? `${current.trimEnd()}\n${link}\n`
      : `${current.trimEnd()}\n\n${heading}\n${link}\n`;
    await this.app.vault.modify(sourceFile, section);
  }
}

class FloatingAiAssistant {
  private plugin: LiquidDashboardPlugin;
  private bubbleEl: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private outputEl: HTMLElement | null = null;
  private contextEl: HTMLElement | null = null;
  private saveButtonEl: HTMLButtonElement | null = null;
  private stopButtonEl: HTMLButtonElement | null = null;
  private lastContext: FloatingAiContext | null = null;
  private lastQuestion = "";
  private lastAnswer = "";
  private running = false;
  private abortController: AbortController | null = null;
  private selectionTimer: number | null = null;

  constructor(plugin: LiquidDashboardPlugin) {
    this.plugin = plugin;
  }

  mount() {
    this.bubbleEl = document.body.createDiv({ cls: "ld-floating-ai-bubble", text: "AI" });
    this.bubbleEl.addEventListener("click", () => this.openPanel());
    document.addEventListener("selectionchange", this.handleSelectionChange);
    document.addEventListener("mouseup", this.handleSelectionChange);
    document.addEventListener("keyup", this.handleSelectionChange);
    this.updateBubbleVisibility();
  }

  unmount() {
    document.removeEventListener("selectionchange", this.handleSelectionChange);
    document.removeEventListener("mouseup", this.handleSelectionChange);
    document.removeEventListener("keyup", this.handleSelectionChange);
    this.bubbleEl?.remove();
    this.panelEl?.remove();
    this.bubbleEl = null;
    this.panelEl = null;
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
    }
    this.abortController?.abort();
  }

  openPanel() {
    this.lastContext = this.plugin.getActiveFloatingContext();
    if (!this.lastContext) {
      new Notice(this.plugin.t("floatingNoContext"));
      this.updateBubbleVisibility(true);
      return;
    }

    if (!this.panelEl) {
      this.renderPanel();
    }
    this.panelEl?.addClass("is-open");
    this.updateContextLabel();
    this.updateBubbleVisibility(true);
    window.setTimeout(() => this.inputEl?.focus(), 20);
  }

  private renderPanel() {
    this.panelEl = document.body.createDiv({ cls: "ld-floating-ai-panel ld-glass" });
    const header = this.panelEl.createDiv({ cls: "ld-floating-ai-header" });
    header.createDiv({ cls: "ld-floating-ai-title", text: this.plugin.t("floatingAskAi") });
    const closeButton = header.createEl("button", { cls: "ld-icon-button", text: "x" });
    closeButton.setAttr("aria-label", this.plugin.t("floatingClose"));
    closeButton.addEventListener("click", () => this.closePanel());

    this.contextEl = this.panelEl.createDiv({ cls: "ld-floating-ai-context" });
    this.inputEl = this.panelEl.createEl("textarea", {
      cls: "ld-textarea ld-floating-ai-input",
      attr: {
        placeholder: this.plugin.t("floatingAskPlaceholder")
      }
    });

    const actions = this.panelEl.createDiv({ cls: "ld-floating-ai-actions" });
    const runButton = actions.createEl("button", { cls: "ld-button ld-button-primary", text: this.plugin.t("floatingRun") });
    runButton.addEventListener("click", () => {
      void this.runQuestion();
    });
    this.stopButtonEl = actions.createEl("button", { cls: "ld-button", text: this.plugin.t("floatingStop") });
    this.stopButtonEl.addEventListener("click", () => {
      this.abortController?.abort();
    });
    this.saveButtonEl = actions.createEl("button", { cls: "ld-button", text: this.plugin.t("floatingSave") });
    this.saveButtonEl.addEventListener("click", () => {
      void this.saveAnswer();
    });

    this.outputEl = this.panelEl.createDiv({ cls: "ld-floating-ai-output markdown-rendered" });
    this.updateButtonState();
  }

  private async runQuestion() {
    if (this.running) {
      return;
    }

    const context = this.plugin.getActiveFloatingContext() ?? this.lastContext;
    const question = this.inputEl?.value.trim() ?? "";
    if (!context) {
      new Notice(this.plugin.t("floatingNoContext"));
      return;
    }
    if (!question) {
      new Notice(this.plugin.t("askQuestionFirst"));
      return;
    }

    this.lastContext = context;
    this.lastQuestion = question;
    this.lastAnswer = "";
    this.running = true;
    this.abortController = new AbortController();
    this.updateContextLabel();
    this.updateButtonState();
    this.setOutput("");

    try {
      const messages = this.plugin.buildFloatingMessages(question, context);
      const result = await this.plugin.callAi(messages, (chunk) => {
        if (this.abortController?.signal.aborted) {
          return;
        }
        this.lastAnswer += chunk;
        this.setOutput(this.lastAnswer);
      }, this.abortController.signal);
      if (!this.lastAnswer.trim()) {
        this.lastAnswer = result;
        this.setOutput(result);
      }
    } catch (error) {
      if (!this.abortController?.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        this.setOutput(`${this.plugin.t("aiRequestFailed")}: ${message}`);
      }
    } finally {
      this.running = false;
      this.abortController = null;
      this.updateButtonState();
    }
  }

  private async saveAnswer() {
    if (!this.lastContext || !this.lastAnswer.trim()) {
      new Notice(this.plugin.t("floatingEmptyAnswer"));
      return;
    }
    await this.plugin.saveFloatingAiAnswer(this.lastAnswer, this.lastQuestion, this.lastContext);
  }

  private closePanel() {
    this.panelEl?.removeClass("is-open");
    this.updateBubbleVisibility();
  }

  private setOutput(markdown: string) {
    if (!this.outputEl) {
      return;
    }
    this.outputEl.empty();
    void MarkdownRenderer.renderMarkdown(markdown || (this.running ? this.plugin.t("aiThinking") : ""), this.outputEl, "", this.plugin);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  private updateContextLabel() {
    if (!this.contextEl || !this.lastContext) {
      return;
    }
    const type = this.lastContext.selectedText ? this.plugin.t("floatingContextSelection") : this.plugin.t("floatingContextDocument");
    const file = this.lastContext.file?.path ?? this.plugin.t("noNoteSelected");
    this.contextEl.setText(`${type} · ${file}`);
  }

  private updateButtonState() {
    this.saveButtonEl?.toggleAttribute("disabled", this.running || !this.lastAnswer.trim());
    this.stopButtonEl?.toggleAttribute("disabled", !this.running);
  }

  private handleSelectionChange = () => {
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
    }
    this.selectionTimer = window.setTimeout(() => this.updateBubbleVisibility(), 120);
  };

  private updateBubbleVisibility(force = false) {
    if (!this.bubbleEl) {
      return;
    }

    const context = this.plugin.getActiveFloatingContext();
    const hasSelection = Boolean(context?.selectedText);
    this.bubbleEl.toggleClass("is-visible", force || hasSelection || Boolean(this.panelEl?.hasClass("is-open")));
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
  private expandedFolders = new Set<string>();
  private collapsedFolders = new Set<string>();
  private noteListScrollTop = 0;
  private aiQuestion = "";
  private aiResult = "";
  private aiBusy = false;
  private taskInput: HTMLInputElement | null = null;
  private taskDateInput: HTMLInputElement | null = null;
  private taskTimeInput: HTMLInputElement | null = null;
  private taskPrioritySelect: HTMLSelectElement | null = null;
  private readingNoteInput: HTMLTextAreaElement | null = null;
  private refreshTimer: number | null = null;
  private latestTasks: DashboardTask[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: LiquidDashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  private t(key: TranslationKey) {
    return this.plugin.t(key);
  }

  private priorityLabel(priority: TaskPriority) {
    return this.t(PRIORITY_META[priority].labelKey);
  }

  getFloatingContextFromDashboard(): FloatingAiContext | null {
    const selectedText = getDomSelectionText();
    const file = this.selectedFile;

    if (selectedText) {
      return {
        file,
        selectedText,
        fullText: selectedText,
        prompt: selectedText
      };
    }

    if (this.page === "reading" && file) {
      return {
        file,
        selectedText: "",
        fullText: `Current reading note: ${file.path}`,
        prompt: `Current reading note: ${file.path}. The user did not select text, so answer based on the current reading page and ask for clarification if needed.`
      };
    }

    if (this.page === "tasks" || this.page === "home") {
      const todayTasks = this.getTasksForRange(this.latestTasks, formatDate(today()), formatDate(today()));
      const upcomingTasks = this.getTasksForRange(this.latestTasks, formatDate(today()), formatDate(addDays(today(), 6)));
      const prompt = [
        `Dashboard page: ${this.page}`,
        "",
        "Today tasks:",
        ...todayTasks.map((task) => `- [${task.completed ? "x" : " "}] ${task.content} ${task.date} ${task.time}`.trim()),
        "",
        "Next 7 days:",
        ...upcomingTasks.map((task) => `- [${task.completed ? "x" : " "}] ${task.content} ${task.date} ${task.time}`.trim()),
        "",
        "If the user asks to create a schedule, infer concrete tasks and dates from their request."
      ].join("\n");
      return {
        file: null,
        selectedText: "",
        fullText: prompt,
        prompt
      };
    }

    return {
      file,
      selectedText: "",
      fullText: `Dashboard page: ${this.page}`,
      prompt: `Dashboard page: ${this.page}. Answer conversationally and ask for missing details when needed.`
    };
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
    this.latestTasks = tasks;

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
        text: this.t(item.labelKey)
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
    await this.renderSelectedNotePreview(left, notes[0] ?? null, this.t("recentNotes"));

    this.renderCalendar(right, tasks);
    this.renderCountdowns(right, tasks);
    this.renderRecentNotes(right, notes);
  }

  private renderHero(container: HTMLElement, tasks: DashboardTask[]) {
    const todayTasks = this.getTasksForRange(tasks, formatDate(today()), formatDate(today()));
    const nextSevenTasks = this.getTasksForRange(tasks, formatDate(today()), formatDate(addDays(today(), 6)));
    const overdueTasks = tasks.filter((task) => !task.completed && this.isTaskOverdue(task));

    const hero = container.createDiv({ cls: "ld-hero ld-glass" });
    const copy = hero.createDiv();
    copy.createDiv({ cls: "ld-kicker", text: this.t("today") });
    copy.createEl("h1", { text: getGreeting(this.plugin.settings.language) });
    copy.createDiv({
      cls: "ld-subtitle",
      text: this.t("heroSubtitle")
    });

    const stats = hero.createDiv({ cls: "ld-stats" });
    this.renderStat(stats, String(todayTasks.filter((task) => !task.completed).length), this.t("today"));
    this.renderStat(stats, String(nextSevenTasks.filter((task) => !task.completed).length), this.t("next7Days"));
    this.renderStat(stats, String(overdueTasks.length), this.t("overdue"));
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
    card.createEl("h2", { text: this.t("quickAddTask") });

    const form = card.createEl("form", { cls: "ld-task-form ld-task-form-time" });
    this.taskInput = form.createEl("input", {
      cls: "ld-input ld-task-input",
      attr: {
        type: "text",
        placeholder: this.t("taskContentPlaceholder")
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
        text: this.priorityLabel(priority),
        value: priority
      });
    });
    this.taskPrioritySelect.value = "normal";

    form.createEl("button", {
      cls: "ld-button ld-button-primary",
      text: this.t("add"),
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
    header.createEl("h2", { text: this.t("tasks") });

    const tabs = header.createDiv({ cls: "ld-tabs" });
    const modes: Array<{ mode: TaskScope; label: string }> = [
      { mode: "today", label: this.selectedDate === formatDate(today()) ? this.t("today") : this.selectedDate },
      { mode: "week", label: this.t("thisWeek") },
      { mode: "next7", label: this.t("next7Days") }
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
      taskList.createDiv({ cls: "ld-empty", text: this.t("noTasksInRange") });
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
    meta.createSpan({ cls: `ld-priority ld-priority-${task.priority}`, text: this.priorityLabel(task.priority) });

    if (!task.completed && this.isTaskOverdue(task)) {
      meta.createSpan({ cls: "ld-overdue", text: this.t("overdue") });
    }
  }

  private async renderReadingPage(container: HTMLElement, notes: TFile[]) {
    const card = container.createDiv({ cls: "ld-card ld-glass ld-reader-shell" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: this.t("reading") });
    const actions = header.createDiv({ cls: "ld-actions" });
    actions.createEl("button", {
      cls: `ld-button ${this.showReadingNotes ? "ld-button-primary" : ""}`,
      text: this.showReadingNotes ? this.t("hideNotes") : this.t("showNotes")
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
    sidebar.createDiv({ cls: "ld-panel-title", text: this.t("allNotes") });
    const search = sidebar.createEl("input", {
      cls: "ld-input",
      attr: {
        type: "search",
        placeholder: this.t("searchNotes"),
        value: this.noteSearch
      }
    });
    search.addEventListener("input", () => {
      this.noteSearch = search.value;
      this.noteListScrollTop = 0;
      void this.render();
    });

    const query = this.noteSearch.trim().toLowerCase();
    const filtered = notes.filter((file) => !query || file.path.toLowerCase().includes(query));
    const list = sidebar.createDiv({ cls: "ld-vault-list" });
    list.addEventListener("scroll", () => {
      this.noteListScrollTop = list.scrollTop;
    });
    const tree = buildNoteTree(filtered);
    tree.children.forEach((node) => this.renderNoteTreeNode(list, node, 0, Boolean(query)));
    window.requestAnimationFrame(() => {
      list.scrollTop = this.noteListScrollTop;
    });
  }

  private renderNoteTreeNode(container: HTMLElement, node: NoteTreeNode, depth: number, forceExpanded: boolean) {
    if (node.type === "folder") {
      const containsSelected = Boolean(this.selectedFile && isPathInside(this.selectedFile.path, node.path));
      const manuallyCollapsed = this.collapsedFolders.has(node.path);
      const expanded = forceExpanded || (!manuallyCollapsed && (containsSelected || this.expandedFolders.has(node.path)));
      const row = container.createEl("button", {
        cls: `ld-tree-row ld-tree-folder ${expanded ? "is-expanded" : ""}`
      });
      row.style.setProperty("--tree-depth", String(depth));
      row.createSpan({ cls: "ld-tree-chevron", text: expanded ? "v" : ">" });
      row.createSpan({ cls: "ld-tree-icon", text: "□" });
      row.createSpan({ cls: "ld-tree-label", text: node.name });
      row.addEventListener("click", () => {
        this.noteListScrollTop = container.scrollTop;
        if (expanded) {
          this.collapsedFolders.add(node.path);
          this.expandedFolders.delete(node.path);
        } else {
          this.collapsedFolders.delete(node.path);
          this.expandedFolders.add(node.path);
        }
        void this.render();
      });

      if (expanded) {
        node.children.forEach((child) => this.renderNoteTreeNode(container, child, depth + 1, forceExpanded));
      }
      return;
    }

    const file = node.file;
    if (!file) {
      return;
    }

    const button = container.createEl("button", {
      cls: `ld-tree-row ld-tree-file ${this.selectedFile?.path === file.path ? "is-active" : ""}`
    });
    button.style.setProperty("--tree-depth", String(depth));
    button.createSpan({ cls: "ld-tree-spacer", text: "" });
    button.createSpan({ cls: "ld-tree-icon", text: "○" });
    button.createSpan({ cls: "ld-tree-label", text: file.basename });
    button.addEventListener("click", () => {
      this.noteListScrollTop = container.scrollTop;
      this.selectedFile = file;
      expandAncestors(file.path, this.expandedFolders, this.collapsedFolders);
      void this.render();
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
      card.createDiv({ cls: "ld-empty", text: this.t("noMarkdownSelected") });
      return;
    }

    if (embedded) {
      const header = card.createDiv({ cls: "ld-article-header" });
      header.createEl("h2", { text: file.basename });
      header.createEl("button", { cls: "ld-button", text: this.t("openInObsidian") }).addEventListener("click", () => {
        void this.app.workspace.getLeaf("tab").openFile(file);
      });
    }

    const preview = card.createDiv({ cls: "ld-note-preview markdown-rendered" });
    const source = await this.app.vault.cachedRead(file);
    await MarkdownRenderer.renderMarkdown(source || "_This note is empty._", preview, file.path, this);
  }

  private renderReadingNoteEditor(container: HTMLElement) {
    const panel = container.createDiv({ cls: "ld-reading-note-panel" });
    panel.createDiv({ cls: "ld-panel-title", text: this.t("readingNote") });
    this.readingNoteInput = panel.createEl("textarea", {
      cls: "ld-textarea",
      attr: {
        placeholder: this.t("readingNotePlaceholder")
      }
    });
    panel.createEl("button", { cls: "ld-button ld-button-primary", text: this.t("saveNote") }).addEventListener("click", () => {
      void this.saveReadingNote();
    });
  }

  private async renderNotesPage(container: HTMLElement) {
    const grid = container.createDiv({ cls: "ld-grid ld-grid-wide" });
    const left = grid.createDiv({ cls: "ld-stack ld-stack-main" });
    const right = grid.createDiv({ cls: "ld-stack ld-stack-side" });

    const card = left.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: this.t("readingNotes") });
    header.createEl("button", { cls: "ld-button", text: this.t("openFile") }).addEventListener("click", async () => {
      const file = await this.getOrCreateFile(this.plugin.settings.readingNotesPath);
      void this.app.workspace.getLeaf("tab").openFile(file);
    });

    const file = await this.getOrCreateFile(this.plugin.settings.readingNotesPath);
    const source = await this.app.vault.cachedRead(file);
    const preview = card.createDiv({ cls: "ld-note-preview markdown-rendered" });
    await MarkdownRenderer.renderMarkdown(source || this.t("noReadingNotes"), preview, file.path, this);

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
    header.createEl("h2", { text: this.t("askAi") });
    header.createDiv({
      cls: "ld-model-pill",
      text: this.getAiProviderLabel()
    });

    const target = card.createDiv({ cls: "ld-ai-target" });
    target.createDiv({ cls: "ld-panel-title", text: this.t("currentDocument") });
    target.createDiv({ cls: "ld-ai-current-file", text: this.selectedFile?.path ?? this.t("noNoteSelected") });

    const actions = card.createDiv({ cls: "ld-ai-actions" });
    actions.createEl("button", { cls: "ld-button ld-button-primary", text: this.t("summarize") }).addEventListener("click", () => {
      void this.runAiAction("summary");
    });
    actions.createEl("button", { cls: "ld-button", text: this.t("generateMindmap") }).addEventListener("click", () => {
      void this.runAiAction("mindmap");
    });

    const question = card.createEl("textarea", {
      cls: "ld-textarea ld-ai-question",
      attr: {
        placeholder: this.t("askQuestionPlaceholder")
      }
    });
    question.value = this.aiQuestion;
    question.addEventListener("input", () => {
      this.aiQuestion = question.value;
    });
    card.createEl("button", { cls: "ld-button ld-button-primary", text: this.t("askAndSave") }).addEventListener("click", () => {
      void this.runAiAction("question");
    });

    if (this.aiBusy) {
      card.createDiv({ cls: "ld-empty", text: this.t("aiThinking") });
    } else if (this.aiResult) {
      const result = card.createDiv({ cls: "ld-ai-result markdown-rendered" });
      await MarkdownRenderer.renderMarkdown(this.aiResult, result, this.selectedFile?.path ?? "", this);
      card.createEl("button", { cls: "ld-button", text: this.t("floatingSave") }).addEventListener("click", async () => {
        if (!this.selectedFile) {
          new Notice(this.t("selectNoteFirst"));
          return;
        }
        await this.saveAiMarkdown("question", this.aiResult, this.selectedFile);
        new Notice(this.t("aiOutputSaved"));
      });
    }

    this.renderVaultNoteList(right, notes);
  }

  private renderDashboardSettingsPage(container: HTMLElement) {
    const grid = container.createDiv({ cls: "ld-grid ld-grid-wide" });
    const left = grid.createDiv({ cls: "ld-stack ld-stack-main" });
    const right = grid.createDiv({ cls: "ld-stack ld-stack-side" });

    const paths = left.createDiv({ cls: "ld-card ld-glass" });
    paths.createEl("h2", { text: this.t("dashboardSettings") });
    paths.createDiv({ cls: "ld-setting-row", text: `${this.t("taskPathLabel")}: ${this.plugin.settings.taskFilePath}` });
    paths.createDiv({ cls: "ld-setting-row", text: `${this.t("readingNotesPathLabel")}: ${this.plugin.settings.readingNotesPath}` });
    paths.createDiv({ cls: "ld-setting-row", text: `${this.t("aiOutputsPathLabel")}: ${this.plugin.settings.aiOutputRoot}` });
    paths.createEl("button", { cls: "ld-button ld-button-primary", text: this.t("openPluginSettings") }).addEventListener("click", () => {
      const setting = (this.app as App & { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
      setting?.open();
      setting?.openTabById(this.plugin.manifest.id);
    });

    const model = right.createDiv({ cls: "ld-card ld-glass" });
    model.createEl("h2", { text: this.t("aiModel") });
    const providerSelect = model.createEl("select", { cls: "ld-input ld-ai-service-select" });
    providerSelect.createEl("option", { text: this.t("providerOpenAi"), value: "openai" });
    providerSelect.createEl("option", { text: this.t("providerClaudeCli"), value: "claudeCodeCli" });
    providerSelect.value = this.plugin.settings.aiProvider;
    providerSelect.addEventListener("change", () => {
      this.plugin.settings.aiProvider = providerSelect.value as AiProvider;
      void this.plugin.saveSettings();
    });
    model.createDiv({ cls: "ld-setting-row", text: `${this.t("aiProvider")}: ${this.getAiProviderLabel()}` });
    if (this.plugin.settings.aiProvider === "openai") {
      model.createDiv({ cls: "ld-setting-row", text: `Base URL: ${this.plugin.settings.openAiBaseUrl || this.t("notSet")}` });
      model.createDiv({ cls: "ld-setting-row", text: `${this.t("model")}: ${this.plugin.settings.openAiModel || this.t("notSet")}` });
      model.createDiv({
        cls: "ld-setting-row",
        text: this.plugin.settings.openAiApiKey ? this.t("apiKeySaved") : this.t("apiKeyNotSet")
      });
    } else {
      model.createDiv({ cls: "ld-setting-row", text: `${this.t("claudeCliCommand")}: ${this.plugin.settings.claudeCliCommand || "claude"}` });
      model.createDiv({ cls: "ld-setting-row", text: `${this.t("claudeCliMaxTurns")}: ${this.plugin.settings.claudeCliMaxTurns}` });
    }
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
    [
      this.t("monday"),
      this.t("tuesday"),
      this.t("wednesday"),
      this.t("thursday"),
      this.t("friday"),
      this.t("saturday"),
      this.t("sunday")
    ].forEach((day) => {
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

  private renderCountdowns(container: HTMLElement, tasks: DashboardTask[]) {
    const card = container.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: this.t("countdowns") });
    header.createEl("button", { cls: "ld-button", text: this.t("settings") }).addEventListener("click", () => {
      this.page = "settings";
      void this.render();
    });

    const items = this.getCountdownItems(tasks);

    if (items.length === 0) {
      card.createDiv({ cls: "ld-empty", text: this.t("addDatesInSettings") });
      return;
    }

    const list = card.createDiv({ cls: "ld-countdowns" });
    items
      .forEach((item) => {
        const days = diffInDays(today(), parseDate(item.date));
        const row = list.createDiv({ cls: "ld-countdown" });
        const copy = row.createDiv();
        copy.createDiv({ cls: "ld-countdown-name", text: item.name });
        const dateText = item.time ? `${item.date} ${item.time}` : item.date;
        const meta = copy.createDiv({ cls: "ld-countdown-date" });
        meta.createSpan({ text: dateText });
        if (item.source === "task") {
          meta.createSpan({ cls: "ld-countdown-source", text: this.t("fromTask") });
        }

        row.createDiv({
          cls: `ld-countdown-days ${days < 0 ? "is-past" : ""}`,
          text: days === 0 ? this.t("today") : days > 0 ? `${days} ${this.t("days")}` : `${Math.abs(days)} ${this.t("daysAgo")}`
        });
      });
  }

  private getCountdownItems(tasks: DashboardTask[]) {
    const manualItems: CountdownDisplayItem[] = this.plugin.settings.countdowns
      .filter((item) => item.name.trim() && isValidDateString(item.date))
      .map((item) => ({
        name: item.name,
        date: item.date,
        source: "manual"
      }));

    const manualKeys = new Set(manualItems.map((item) => `${item.name}::${item.date}`));
    const taskItems: CountdownDisplayItem[] = tasks
      .filter((task) => !task.completed && task.date > formatDate(today()))
      .map((task) => ({
        name: task.content,
        date: task.date,
        time: task.time,
        source: "task" as const
      }))
      .filter((item) => !manualKeys.has(`${item.name}::${item.date}`));

    return [...manualItems, ...taskItems].sort((a, b) => {
      const aValue = `${a.date} ${a.time ?? "23:59"}`;
      const bValue = `${b.date} ${b.time ?? "23:59"}`;
      return aValue.localeCompare(bValue);
    });
  }

  private renderRecentNotes(container: HTMLElement, recentNotes: TFile[]) {
    const card = container.createDiv({ cls: "ld-card ld-glass" });
    const header = card.createDiv({ cls: "ld-card-header" });
    header.createEl("h2", { text: this.t("recentNotes") });

    if (recentNotes.length === 0) {
      card.createDiv({ cls: "ld-empty", text: this.t("noMarkdownNotes") });
      return;
    }

    const list = card.createDiv({ cls: "ld-recent-list" });
    recentNotes.slice(0, this.plugin.settings.recentNoteLimit).forEach((file) => {
      const button = list.createEl("button", { cls: "ld-recent-note" });
      button.createSpan({ cls: "ld-recent-title", text: file.basename });
      button.createSpan({ cls: "ld-recent-time", text: formatRelativeDate(new Date(file.stat.mtime), this.plugin.settings.language) });

      button.addEventListener("click", () => {
        this.selectedFile = file;
        this.page = "reading";
        void this.render();
      });
    });
  }

  private renderTaskFileCard(container: HTMLElement) {
    const card = container.createDiv({ cls: "ld-card ld-glass" });
    card.createEl("h2", { text: this.t("taskStorage") });
    card.createDiv({ cls: "ld-setting-row", text: this.plugin.settings.taskFilePath });
    card.createEl("button", { cls: "ld-button", text: this.t("openTaskFile") }).addEventListener("click", async () => {
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
      new Notice(this.t("taskContentRequired"));
      return;
    }

    if (!isValidDateString(date)) {
      new Notice(this.t("chooseValidDate"));
      return;
    }

    if (time && !isValidTimeString(time)) {
      new Notice(this.t("chooseValidTime"));
      return;
    }

    await this.appendTask(content, date, time, priority);
    new Notice(this.t("taskAdded"));
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
      new Notice(this.t("writeNoteBeforeSaving"));
      return;
    }

    const file = await this.getOrCreateFile(this.plugin.settings.readingNotesPath);
    const sourceLink = this.selectedFile ? `[[${this.selectedFile.path}|${this.selectedFile.basename}]]` : this.t("noSourceNote");
    const entry = [
      `## ${formatDateTime(new Date())}`,
      "",
      `${this.t("source")}: ${sourceLink}`,
      "",
      content,
      ""
    ].join("\n");
    const current = await this.app.vault.cachedRead(file);
    await this.app.vault.modify(file, `${current.trimEnd()}\n\n${entry}`.trimStart());
    if (this.readingNoteInput) {
      this.readingNoteInput.value = "";
    }
    new Notice(this.t("readingNoteSaved"));
  }

  private async runAiAction(action: AiAction) {
    if (!this.selectedFile) {
      new Notice(this.t("selectNoteFirst"));
      return;
    }

    const configError = this.getAiConfigError();
    if (configError) {
      new Notice(configError);
      this.page = "settings";
      await this.render();
      return;
    }

    if (action === "question" && !this.aiQuestion.trim()) {
      new Notice(this.t("askQuestionFirst"));
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
        this.aiResult = `${this.t("canvasMindmapSaved")}: [[${canvasPath}]]`;
        new Notice(this.t("canvasMindmapSaved"));
      } else {
        const result = await this.callAi(this.buildAiMessages(action, source, this.selectedFile));
        this.aiResult = result;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.aiResult = `${this.t("aiRequestFailed")}: ${message}`;
      new Notice(this.t("aiRequestFailed"));
    } finally {
      this.aiBusy = false;
      await this.render();
    }
  }

  private buildAiMessages(action: Exclude<AiAction, "mindmap">, source: string, file: TFile): AiMessage[] {
    const system = this.plugin.settings.language === "zh"
      ? "你是 Obsidian 助手。请用中文清晰回答，使用简洁 Markdown。"
      : "You are an Obsidian assistant. Answer clearly in English. Use concise Markdown.";
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
          "Use short stable ASCII ids.",
          "The first node must be the central topic and must have no parentId.",
          "Only connect a node to its direct conceptual parent.",
          "Avoid cross-links, duplicate concepts, and long chains of tiny implementation details.",
          "Prefer 4 to 8 main branches and at most 3 levels deep."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          `Document path: ${file.path}`,
          "",
          "Create a clean Canvas mind map for this document.",
          "Limit it to 18 nodes unless the document truly needs more.",
          "Keep labels short enough to fit inside a node.",
          "",
          source.slice(0, 18000)
        ].join("\n")
      }
    ];

    const result = await this.callAi(messages);
    return parseMindmapJson(result);
  }

  private async callAi(messages: AiMessage[]) {
    if (this.plugin.settings.aiProvider === "claudeCodeCli") {
      return callClaudeCodeCli(this.plugin.settings, messages);
    }

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

  private getAiProviderLabel() {
    if (this.plugin.settings.aiProvider === "claudeCodeCli") {
      return `${this.t("providerClaudeCli")}: ${this.plugin.settings.claudeCliCommand || "claude"}`;
    }
    return this.plugin.settings.openAiModel || this.t("noModel");
  }

  private getAiConfigError() {
    if (this.plugin.settings.aiProvider === "claudeCodeCli") {
      if (!this.plugin.settings.claudeCliCommand.trim()) {
        return this.t("configureClaudeCliFirst");
      }
      if (!getNodeRequire()) {
        return this.t("claudeCliDesktopOnly");
      }
      return "";
    }

    if (!this.plugin.settings.openAiBaseUrl || !this.plugin.settings.openAiApiKey || !this.plugin.settings.openAiModel) {
      return this.t("configureAiFirst");
    }
    return "";
  }

  private async saveAiMarkdown(action: Exclude<AiAction, "mindmap">, content: string, sourceFile: TFile) {
    const folder = await this.ensureAiDocumentFolder(sourceFile);
    const fileName = action === "summary" ? "summary.md" : `question-${slugify(formatDateTime(new Date()))}.md`;
    const path = `${folder}/${fileName}`;
    const body = [
      `# ${action === "summary" ? this.t("aiSummary") : this.t("aiQuestion")}`,
      "",
      `${this.t("source")}: [[${sourceFile.path}|${sourceFile.basename}]]`,
      "",
      action === "question" ? `${this.t("question")}: ${this.aiQuestion.trim()}\n` : "",
      content,
      ""
    ].join("\n");

    await this.writeFile(path, body);
    await this.appendBacklink(sourceFile, path, action === "summary" ? this.t("aiSummaryLink") : this.t("aiQuestionLink"));
    return path;
  }

  private async saveMindmapCanvas(nodes: MindmapNode[], sourceFile: TFile) {
    const folder = await this.ensureAiDocumentFolder(sourceFile);
    const path = `${folder}/mindmap.canvas`;
    const canvas = buildCanvas(nodes, sourceFile.path);

    await this.writeFile(path, JSON.stringify(canvas, null, 2));
    await this.appendBacklink(sourceFile, path, this.t("aiMindmapLink"));
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

    const heading = `## ${this.t("aiOutputsHeading")}`;
    const section = current.includes(heading)
      ? `${current.trimEnd()}\n${link}\n`
      : `${current.trimEnd()}\n\n${heading}\n${link}\n`;
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

  private t(key: TranslationKey) {
    return this.plugin.t(key);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("liquid-dashboard-settings");

    containerEl.createEl("h2", { text: "Liquid Dashboard Home" });

    new Setting(containerEl)
      .setName(this.t("language"))
      .setDesc(this.t("languageDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("zh", this.t("languageZh"))
          .addOption("en", this.t("languageEn"))
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as DashboardLanguage;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(this.t("taskFile"))
      .setDesc(this.t("taskFileDesc"))
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
      .setName(this.t("readingNotesFile"))
      .setDesc(this.t("readingNotesFileDesc"))
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
      .setName(this.t("aiOutputRoot"))
      .setDesc(this.t("aiOutputRootDesc"))
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
      .setName(this.t("openOnStartup"))
      .setDesc(this.t("openOnStartupDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoOpenDashboard)
          .onChange(async (value) => {
            this.plugin.settings.autoOpenDashboard = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t("recentNoteCount"))
      .setDesc(this.t("recentNoteCountDesc"))
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

    containerEl.createEl("h3", { text: this.t("defaultAiService") });

    new Setting(containerEl)
      .setName(this.t("defaultAiService"))
      .setDesc(this.t("defaultAiServiceDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openai", this.t("providerOpenAi"))
          .addOption("claudeCodeCli", this.t("providerClaudeCli"))
          .setValue(this.plugin.settings.aiProvider)
          .onChange(async (value) => {
            this.plugin.settings.aiProvider = value as AiProvider;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    containerEl.createEl("h3", { text: this.t("openAiCompatibleModel") });

    new Setting(containerEl)
      .setName(this.t("apiBaseUrl"))
      .setDesc(this.t("apiBaseUrlDesc"))
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
      .setName(this.t("apiKey"))
      .setDesc(this.t("apiKeyDesc"))
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
      .setName(this.t("model"))
      .setDesc(this.t("modelDesc"))
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.openAiModel)
          .onChange(async (value) => {
            this.plugin.settings.openAiModel = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: this.t("claudeCliSettings") });

    new Setting(containerEl)
      .setName(this.t("claudeCliCommand"))
      .setDesc(this.t("claudeCliCommandDesc"))
      .addText((text) =>
        text
          .setPlaceholder("claude")
          .setValue(this.plugin.settings.claudeCliCommand)
          .onChange(async (value) => {
            this.plugin.settings.claudeCliCommand = value.trim() || DEFAULT_SETTINGS.claudeCliCommand;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t("claudeCliMaxTurns"))
      .setDesc(this.t("claudeCliMaxTurnsDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.claudeCliMaxTurns)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.claudeCliMaxTurns = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t("claudeCliTimeout"))
      .setDesc(this.t("claudeCliTimeoutDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(30, 600, 30)
          .setValue(this.plugin.settings.claudeCliTimeoutSeconds)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.claudeCliTimeoutSeconds = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: this.t("updateSettings") });

    new Setting(containerEl)
      .setName(this.t("updateRepo"))
      .setDesc(this.t("updateRepoDesc"))
      .addText((text) =>
        text
          .setPlaceholder("Karovia/Obsidian-dashboard")
          .setValue(this.plugin.settings.updateRepo)
          .onChange(async (value) => {
            this.plugin.settings.updateRepo = value.trim() || DEFAULT_SETTINGS.updateRepo;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t("updateBranch"))
      .setDesc(this.t("updateBranchDesc"))
      .addText((text) =>
        text
          .setPlaceholder("main")
          .setValue(this.plugin.settings.updateBranch)
          .onChange(async (value) => {
            this.plugin.settings.updateBranch = value.trim() || DEFAULT_SETTINGS.updateBranch;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t("autoCheckUpdates"))
      .setDesc(this.t("autoCheckUpdatesDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoCheckUpdates)
          .onChange(async (value) => {
            this.plugin.settings.autoCheckUpdates = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .addButton((button) =>
        button
          .setButtonText(this.t("checkAndInstallUpdate"))
          .setCta()
          .onClick(async () => {
            new Notice(this.t("updateChecking"));
            try {
              await this.plugin.checkForUpdate(true);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              new Notice(`${this.t("updateFailed")}: ${message}`);
            }
          })
      );

    containerEl.createEl("h3", { text: this.t("countdowns") });
    containerEl.createDiv({
      cls: "setting-item-description",
      text: this.t("countdownsDesc")
    });

    this.plugin.settings.countdowns.forEach((item, index) => {
      const setting = new Setting(containerEl)
        .setName(`${this.t("countdown")} ${index + 1}`)
        .addText((text) =>
          text
            .setPlaceholder(this.t("name"))
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
            .setButtonText(this.t("delete"))
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
          .setButtonText(this.t("addCountdown"))
          .setCta()
          .onClick(async () => {
            this.plugin.settings.countdowns.push({
              name: this.t("newCountdown"),
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

function normalizeSettings(settings: DashboardSettings) {
  if (settings.aiProvider !== "openai" && settings.aiProvider !== "claudeCodeCli") {
    settings.aiProvider = DEFAULT_SETTINGS.aiProvider;
  }

  if (!settings.claudeCliCommand) {
    settings.claudeCliCommand = DEFAULT_SETTINGS.claudeCliCommand;
  }

  if (!Number.isFinite(settings.claudeCliMaxTurns) || settings.claudeCliMaxTurns < 1) {
    settings.claudeCliMaxTurns = DEFAULT_SETTINGS.claudeCliMaxTurns;
  }

  if (!Number.isFinite(settings.claudeCliTimeoutSeconds) || settings.claudeCliTimeoutSeconds < 30) {
    settings.claudeCliTimeoutSeconds = DEFAULT_SETTINGS.claudeCliTimeoutSeconds;
  }

  return settings;
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

async function callClaudeCodeCli(settings: DashboardSettings, messages: AiMessage[], onChunk?: (chunk: string) => void, signal?: AbortSignal) {
  const nodeRequire = getNodeRequire();
  if (!nodeRequire) {
    throw new Error("Claude Code CLI is only available in Obsidian desktop.");
  }

  const { spawn } = nodeRequire("child_process") as typeof import("child_process");
  const prompt = messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n---\n\n");
  const args = [
    "-p",
    prompt,
    "--output-format",
    onChunk ? "stream-json" : "json",
    ...(onChunk ? ["--verbose"] : []),
    "--max-turns",
    String(settings.claudeCliMaxTurns || DEFAULT_SETTINGS.claudeCliMaxTurns)
  ];

  return new Promise<string>((resolve, reject) => {
    const child = spawn(settings.claudeCliCommand || DEFAULT_SETTINGS.claudeCliCommand, args, {
      shell: isWindows(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let streamedAnswer = "";
    let settled = false;
    const timeout = window.setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error("Claude Code CLI request timed out."));
      }
    }, (settings.claudeCliTimeoutSeconds || DEFAULT_SETTINGS.claudeCliTimeoutSeconds) * 1000);

    const abortHandler = () => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error("Claude Code CLI request stopped."));
      }
    };
    signal?.addEventListener("abort", abortHandler, { once: true });

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (!onChunk) {
        return;
      }
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      lines.forEach((line) => {
        const chunk = parseClaudeStreamLine(line);
        if (chunk) {
          streamedAnswer += chunk;
          onChunk(chunk);
        }
      });
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error: Error) => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abortHandler);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("close", (code: number | null) => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abortHandler);
      if (settled) {
        return;
      }
      settled = true;
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Claude Code CLI exited with code ${code ?? "unknown"}.`));
        return;
      }
      if (onChunk) {
        const trailing = parseClaudeStreamLine(lineBuffer);
        if (trailing) {
          streamedAnswer += trailing;
          onChunk(trailing);
        }
        resolve(streamedAnswer.trim() || parseClaudeCliOutput(stdout.trim()));
        return;
      }
      resolve(parseClaudeCliOutput(stdout.trim()));
    });
  });
}

function parseClaudeStreamLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const json = JSON.parse(trimmed) as {
      type?: string;
      result?: string;
      delta?: { text?: string };
      message?: { content?: string | Array<{ text?: string; type?: string }> };
    };
    if (json.type === "result" && typeof json.result === "string") {
      return "";
    }
    if (json.delta?.text) {
      return json.delta.text;
    }
    const content = json.message?.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((part) => part.text ?? "").join("");
    }
  } catch {
    return "";
  }

  return "";
}

function parseClaudeCliOutput(output: string) {
  try {
    const json = JSON.parse(output) as {
      result?: string;
      content?: string;
      message?: { content?: string | Array<{ text?: string; type?: string }> };
    };

    if (typeof json.result === "string" && json.result.trim()) {
      return json.result.trim();
    }

    if (typeof json.content === "string" && json.content.trim()) {
      return json.content.trim();
    }

    const messageContent = json.message?.content;
    if (typeof messageContent === "string" && messageContent.trim()) {
      return messageContent.trim();
    }

    if (Array.isArray(messageContent)) {
      const text = messageContent
        .map((part) => part.text ?? "")
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  } catch {
    return output;
  }

  return output;
}

function getNodeRequire() {
  const hostWindow = window as Window & { require?: NodeRequire; process?: { platform?: string } };
  return hostWindow.require;
}

function isWindows() {
  const hostWindow = window as Window & { process?: { platform?: string } };
  return hostWindow.process?.platform === "win32";
}

function buildNoteTree(files: TFile[]) {
  const root: NoteTreeNode = {
    name: "",
    path: "",
    type: "folder",
    children: []
  };

  files.forEach((file) => {
    const parts = file.path.split("/");
    let current = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      let child = current.children.find((candidate) => candidate.path === path);
      if (!child) {
        child = {
          name: isFile ? file.basename : part,
          path,
          type: isFile ? "file" : "folder",
          children: [],
          file: isFile ? file : undefined
        };
        current.children.push(child);
      }
      current = child;
    });
  });

  sortNoteTree(root);
  return root;
}

function sortNoteTree(node: NoteTreeNode) {
  node.children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  node.children.forEach(sortNoteTree);
}

function isPathInside(filePath: string, folderPath: string) {
  return filePath === folderPath || filePath.startsWith(`${folderPath}/`);
}

function expandAncestors(filePath: string, expandedFolders: Set<string>, collapsedFolders: Set<string>) {
  const parts = filePath.split("/");
  parts.pop();
  let current = "";
  parts.forEach((part) => {
    current = current ? `${current}/${part}` : part;
    expandedFolders.add(current);
    collapsedFolders.delete(current);
  });
}

function buildCanvas(nodes: MindmapNode[], sourcePath: string) {
  const normalizedNodes = normalizeMindmapNodes(nodes);
  const root = normalizedNodes.find((node) => !node.parentId) ?? normalizedNodes[0] ?? {
    id: "root",
    label: sourcePath.split("/").pop()?.replace(/\.md$/i, "") ?? "Mind map"
  };
  const children = new Map<string, MindmapNode[]>();
  normalizedNodes.forEach((node) => {
    if (!node.parentId || node.id === root.id) {
      return;
    }
    const parentId = normalizedNodes.some((candidate) => candidate.id === node.parentId) ? node.parentId : root.id;
    const list = children.get(parentId) ?? [];
    list.push(node);
    children.set(parentId, list);
  });

  const rootChildren = children.get(root.id) ?? [];
  const leftBranches = rootChildren.filter((_, index) => index % 2 === 1);
  const rightBranches = rootChildren.filter((_, index) => index % 2 === 0);
  const positions = new Map<string, { x: number; y: number }>();
  const canvasNodes: Array<Record<string, string | number>> = [];
  const edges: Array<Record<string, string>> = [];

  positions.set(root.id, { x: 0, y: 0 });
  canvasNodes.push({
    id: "source-note",
    type: "file",
    file: sourcePath,
    x: 0,
    y: -220,
    width: 280,
    height: 120
  });
  canvasNodes.push({
    id: root.id,
    type: "text",
    text: root.label,
    x: 0,
    y: 0,
    width: 300,
    height: 110
  });
  edges.push({
    id: "edge-source-root",
    fromNode: "source-note",
    toNode: root.id,
    fromSide: "bottom",
    toSide: "top"
  });

  layoutBranches(rightBranches, 1, children, positions, canvasNodes, edges, root.id);
  layoutBranches(leftBranches, -1, children, positions, canvasNodes, edges, root.id);

  return {
    nodes: canvasNodes,
    edges
  };
}

function normalizeMindmapNodes(nodes: MindmapNode[]) {
  const seen = new Set<string>();
  return nodes.map((node, index) => {
    let id = slugify(node.id || `node-${index}`);
    while (seen.has(id)) {
      id = `${id}-${index}`;
    }
    seen.add(id);
    return {
      id,
      label: node.label,
      parentId: node.parentId ? slugify(node.parentId) : undefined
    };
  });
}

function layoutBranches(
  branches: MindmapNode[],
  direction: 1 | -1,
  children: Map<string, MindmapNode[]>,
  positions: Map<string, { x: number; y: number }>,
  canvasNodes: Array<Record<string, string | number>>,
  edges: Array<Record<string, string>>,
  rootId: string
) {
  const branchGap = 190;
  const childGap = 128;
  const levelGap = 360;
  const totalHeight = Math.max(0, branches.length - 1) * branchGap;

  branches.forEach((branch, branchIndex) => {
    const baseY = branchIndex * branchGap - totalHeight / 2;
    placeMindmapSubtree(branch, rootId, direction, 1, baseY, children, positions, canvasNodes, edges, childGap, levelGap);
  });
}

function placeMindmapSubtree(
  node: MindmapNode,
  parentId: string,
  direction: 1 | -1,
  level: number,
  y: number,
  children: Map<string, MindmapNode[]>,
  positions: Map<string, { x: number; y: number }>,
  canvasNodes: Array<Record<string, string | number>>,
  edges: Array<Record<string, string>>,
  childGap: number,
  levelGap: number
) {
  const x = direction * level * levelGap;
  positions.set(node.id, { x, y });
  canvasNodes.push({
    id: node.id,
    type: "text",
    text: node.label,
    x,
    y,
    width: level === 1 ? 280 : 240,
    height: level === 1 ? 104 : 88
  });
  edges.push({
    id: `edge-${parentId}-${node.id}`,
    fromNode: parentId,
    toNode: node.id,
    fromSide: direction === 1 ? "right" : "left",
    toSide: direction === 1 ? "left" : "right"
  });

  const childNodes = children.get(node.id) ?? [];
  const totalHeight = Math.max(0, childNodes.length - 1) * childGap;
  childNodes.forEach((child, index) => {
    placeMindmapSubtree(
      child,
      node.id,
      direction,
      level + 1,
      y + index * childGap - totalHeight / 2,
      children,
      positions,
      canvasNodes,
      edges,
      childGap,
      levelGap
    );
  });
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

function translate(language: DashboardLanguage, key: TranslationKey) {
  return TEXT[language]?.[key] ?? TEXT.en[key];
}

function getDomSelectionText() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? "";
  return text.length > 0 ? text : "";
}

function compareVersions(a: string, b: string) {
  const aParts = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function getGreeting(language: DashboardLanguage) {
  const hour = new Date().getHours();
  if (hour < 6) {
    return translate(language, "greetingLate");
  }
  if (hour < 12) {
    return translate(language, "greetingMorning");
  }
  if (hour < 18) {
    return translate(language, "greetingAfternoon");
  }
  return translate(language, "greetingEvening");
}

function formatRelativeDate(date: Date, language: DashboardLanguage) {
  const days = diffInDays(today(), new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  if (days === 0) {
    return translate(language, "today");
  }
  if (days === -1) {
    return translate(language, "yesterday");
  }
  if (days > -7 && days < 0) {
    return `${Math.abs(days)} ${translate(language, "daysAgo")}`;
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
