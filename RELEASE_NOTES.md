## Plume Hub 1.0.0

First public release. A Canvas assignment workflow orchestrator for students using [Claude Code](https://claude.com/claude-code).

### What it does

Plume Hub sits alongside your Canvas dashboard and launches Claude Code workflows tailored to how deep you want to go on an assignment. Four modes per assignment card:

- **Think** — deep research pass that surfaces facts, angles, and sources
- **Draft** — structural template with section headers + rubric-aligned bullets
- **Build** — the complete submission, polished through three critique passes (authenticity → rubric+substance → cohesion) and optimized for maximum marks
- **Study** — practice exam, flashcards, and full study presentation pulled from Canvas content

Plus a **Resume** button that continues your existing Claude session without re-injecting a prompt.

### What you get on first launch

The installer seeds your `~/.claude/` with a curated library on first Build-mode click:

- 44 agents
- 46 skills
- 9 pre-organized Library groups
- 2 MCP templates (`jcodemunch`, `chrome-devtools` — no credentials needed)
- 5 Plume workflow agents (version-stamped, auto-upgrade on future releases)

Copy-if-missing semantics: your existing customizations are never overwritten.

### Optional: install 59 recommended plugins

**Settings → Recommended plugins** has a one-click bulk installer that runs `claude plugin install` for a hand-picked set: superpowers, pr-review-toolkit, feature-dev, context7, the full suite of language-server-protocols, and service connectors for GitHub, Slack, Notion, Linear, and more.

### Highlights

- **3-column Library** — Agents, Skills, and MCPs side-by-side (falls back to tabs on narrow windows), each column grouped by topic
- **"Optimize Skills" button** — launches Claude to audit every skill, flag redundancies, and suggest merges
- **Canvas dashboard hides submitted assignments** automatically
- **PowerShell + Plume Hub auto-split-screen** so you can watch context and agent output at once
- **Encrypted local vault** for your Canvas token and any API keys (OS keychain-backed)

### Install

1. Download `Plume Hub Setup 1.0.0.exe` below.
2. Run it. Windows SmartScreen may warn about an unrecognized publisher — click **More info → Run anyway**.
3. Launch Plume Hub from the Start menu.

### Requirements

- Windows 10 or 11
- [Claude Code CLI](https://claude.com/download) installed and on PATH
- A Canvas account (any institution exposing the standard Canvas LMS API)

### Known limitations

- Windows only for v1.0.0 (launcher is PowerShell-specific)
- SmartScreen may flag the installer on first run — NSIS is signed but not EV-code-signed yet
- MCPs requiring credentials (Obsidian vault, Google Drive, etc.) are not bundled — add your own via **Library → MCPs → + Add MCP**

### Links

- [Source](https://github.com/UnlimitedxIQ/plume-hub)
- [README](https://github.com/UnlimitedxIQ/plume-hub#readme)
- [License: MIT](https://github.com/UnlimitedxIQ/plume-hub/blob/main/LICENSE)
