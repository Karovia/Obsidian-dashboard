# Liquid Dashboard Home

Liquid Dashboard Home is an Obsidian plugin by Karovia. It turns Obsidian into a liquid-glass style home workspace for tasks, calendar planning, reading, notes, AI assistance, and Canvas mind maps.

## Plugin Info

- Plugin ID: `liquid-dashboard-home`
- Plugin name: `Liquid Dashboard Home`
- Author: `Karovia`
- Author URL: [https://github.com/Karovia](https://github.com/Karovia)
- Repository: [Karovia/Obsidian-dashboard](https://github.com/Karovia/Obsidian-dashboard)
- Minimum Obsidian version: `1.5.0`
- Desktop only: `false`
- Current version: `0.3.3`

## Features

- Liquid-glass dashboard UI inspired by iOS.
- Auto-open dashboard when Obsidian starts.
- Top navigation tabs: Home, Tasks, Reading, Notes, Ask AI, Settings.
- Task quick-add with date, time, and priority.
- Tasks saved to `Dashboard/Tasks.md` using an Obsidian Tasks-compatible style:

```md
- [ ] Task content 📅 2026-05-27 ⏰ 18:30 🔼
```

- Calendar panel with daily task counts.
- Future dated tasks are shown automatically in countdowns.
- Today, this week, and next 7 days task views.
- Folder-tree note browser and in-dashboard Markdown reading.
- Optional reading notes side panel.
- Reading notes saved to `Dashboard/Reading Notes.md`.
- OpenAI-compatible AI settings:
  - API Base URL
  - API Key
  - Model name
- Ask AI actions:
  - Summarize the current note
  - Ask questions about the current note
  - Generate `.canvas` mind maps
- AI outputs saved under `AI Outputs/{source document name}/`.
- AI-generated outputs are linked back from the source note.
- Chinese and English UI language switch.
- Remote updater for pulling `manifest.json`, `main.js`, and `styles.css` from GitHub.

## Installation

### Manual Install

1. Download or clone this repository.
2. Build the plugin:

```bash
npm install
npm run build
```

3. Copy these files into your Obsidian vault plugin folder:

```text
.obsidian/plugins/liquid-dashboard-home/
```

Required files:

```text
manifest.json
main.js
styles.css
```

4. Restart Obsidian or reload community plugins.
5. Enable `Liquid Dashboard Home` in Obsidian settings.

## Remote Updates

From version `0.3.0`, the plugin includes a remote update section in its settings.

Default update source:

```text
Karovia/Obsidian-dashboard
main
```

The updater downloads and replaces:

```text
manifest.json
main.js
styles.css
```

After installing an update, restart Obsidian or reload plugins to apply the new version.

## Development

```bash
npm install
npm run dev
```

Build a production bundle:

```bash
npm run build
```

## License

MIT
