# Plume Hub

A Canvas assignment workflow orchestrator for students using [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).

Plume Hub is a Windows desktop app that sits alongside your Canvas LMS dashboard and launches Claude Code workflows tailored to how deep you want to go on an assignment: a quick outline, a structural draft, a full submission-ready deliverable, or a complete exam-prep study pack.

Every install comes with a curated library of Claude Code agents, skills, and MCP templates out of the box — you get a near-complete setup without configuring anything.

---

## Install

1. Download the latest `Plume Hub Setup X.Y.Z.exe` from the [Releases page](../../releases).
2. Run it. Windows may warn about an unrecognized publisher on the first run — click **More info → Run anyway** (the installer is NSIS and signed but not yet EV-code-signed).
3. Launch Plume Hub from the Start menu.

### Requirements

- **Windows 10/11** (NSIS `.exe` installer on the Releases page) **or macOS** (build the `.dmg` from source — see [Building for Mac](#building-for-mac))
- **[Claude Code CLI](https://claude.com/download)** installed and available on your PATH (`claude` should work in your shell)
- A **Canvas account** at an institution that exposes the standard Canvas LMS API

---

## What you get on first launch

The installer ships a full library of Claude Code tools, seeded automatically into your `~/.claude/` directory the first time you click a Build-mode assignment button:

| Kind | Count | Where it lands |
|---|---|---|
| Agents | 44 | `~/.claude/agents/` |
| Skills | 46 | `~/.claude/skills/` |
| Group organization | 9 groups | `~/.claude/plume-groups.json` |
| MCP templates | 2 (no credentials needed) | `~/.claude.json` → `mcpServers` |
| Plume workflow agents | 5 | `~/.claude/agents/plume-*` |

First-launch seeding uses a "copy if missing" rule — it never overwrites anything you've customized, and a sentinel file prevents re-seeding on subsequent launches.

### Optional: install recommended plugins

**Settings → Recommended plugins** has a one-click bulk installer that runs `claude plugin install` for 59 hand-picked plugins (superpowers, pr-review-toolkit, feature-dev, context7, and the full set of language-server-protocols, service connectors, and utility packs). You can skip any individually or install them all at once.

---

## How it works

Plume Hub reads your Canvas assignments via the official API, then for each assignment you can click one of four mode buttons:

- **Think** — deep research pass that surfaces facts, angles, and sources so you can decide your approach
- **Draft** — structural template with section headers, bullets, and rubric-aligned content guides
- **Build** — the complete submission, polished through three purpose-specific critique passes (authenticity → rubric+substance → cohesion) and optimized for maximum marks
- **Study** — practice exam, flashcards, and a full study presentation pulling from the course's Canvas content

Clicking a mode button opens PowerShell snapped to the right half of your screen and launches Claude Code with the appropriate workflow agent. Plume Hub itself snaps to the left half, so you can watch the assignment context and the agent's output side-by-side.

A **Resume** button on each assignment card continues the existing Claude session without injecting a new prompt — useful when you want to pick up where you left off.

---

## Canvas setup

1. Launch Plume Hub, go to **Settings → Canvas LMS**.
2. Paste your Canvas API token. (Get one at Canvas → Account → Settings → "New Access Token".)
3. Set your Canvas base URL if yours isn't the default.
4. Your token is encrypted locally via the OS keychain — it never leaves your machine.

---

## Privacy & what's bundled

Plume Hub's installer ships a curated subset of the author's personal Claude Code library. For transparency, here's what IS and ISN'T included:

**Bundled (shipped in the installer):**
- All general-purpose agents and skills
- Group organization (a starting layout for the Library panel)
- MCP templates with no credentials (jcodemunch, chrome-devtools)
- A manifest of recommended plugins

**Not bundled (filtered out at build time):**
- Writing-style profiles (personal voice fingerprints — not useful to others)
- Skills tied to specific personal projects (`ai-atlas`, `gumroad`, `higgsfield`, etc.)
- Skills that reference a specific institution (`canvas` was UO-specific, `gdrive` references a local MCP server path)
- Any API keys, tokens, or credentials

See [`scripts/bundle-user-library.mjs`](scripts/bundle-user-library.mjs) for the exact filter logic — it's a ~150-line script that snapshots `~/.claude/{agents,skills,plume-groups.json}` and applies a documented exclusion list.

---

## Building for Mac

The `.dmg` must be built on macOS — electron-builder can't cross-compile a Mac installer from Windows. If you have a Mac:

```bash
git clone https://github.com/UnlimitedxIQ/plume-hub
cd plume-hub
npm install
npm run dist:mac
# → release/Plume Hub-X.Y.Z.dmg
```

The `bundle:library` step in the pipeline snapshots YOUR current `~/.claude/` state (agents + skills + group config) into the installer. Fresh checkouts with no Claude Code content produce an empty bundle — that's expected.

On first launch, Mac users will see a Gatekeeper warning: "Plume Hub cannot be opened because the developer cannot be verified." Right-click the app in `/Applications` → **Open** → **Open** in the dialog. (The `v1.0.0` .dmg is unsigned; EV code-signing is a future release goal.)

Platform-specific code lives in:
- `src/main/platform.ts` — tiny helpers (`isMac`, `isWindows`, shell-escape functions)
- `src/main/launcher.ts` — writes `.ps1` on Windows, `.sh` on Mac; spawns via `cmd.exe /c start powershell.exe` or `osascript "tell Terminal to do script …"`
- `src/main/skill-optimizer.ts` — same pattern
- `src/main/ipc-handlers.ts` → `snapLeft()` — Mac skips the Windows-11 invisible-border fudge

## For developers

```bash
# Dev mode (hot-reload renderer, rebuilds main on save)
npm install
npm run dev

# Build a fresh installer for your current platform
npm run dist
# → release/Plume Hub Setup X.Y.Z.exe  (Windows)
# → release/Plume Hub-X.Y.Z.dmg        (macOS)

# Or force a specific platform
npm run dist:win
npm run dist:mac
```

The `dist` script runs `bundle-user-library.mjs` first, which snapshots the current machine's `~/.claude/` state into `resources/bundled-library/`. That directory is gitignored — it's regenerated on every build.

Key source:
- **Main process**: `src/main/` (launcher, IPC handlers, Canvas client, workflow installer, scanners)
- **Renderer**: `src/panels/` (Canvas, Library, Session, Settings panels)
- **Bundled workflows**: `resources/plume-skills/` (Plume-owned, version-stamped, auto-upgrade on each release)

---

## License

MIT — see [LICENSE](LICENSE).

Built by [Bryson Smith](https://github.com/UnlimitedxIQ). Canvas assignment workflow research and voice-profile matching informed by real undergraduate coursework at the University of Oregon.
