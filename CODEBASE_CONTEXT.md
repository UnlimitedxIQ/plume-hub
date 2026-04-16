# Plume Hub — Codebase Context Map

> Scannable map of modules, symbols, and architecture. Read this first before grepping.
> Last refresh: 2026-04-13. Update when any 3+ file plan completes.

---

## Architecture Overview

Plume Hub is a **normal Windows desktop app** (Electron 34 + React + Vite + Tailwind) that wraps Canvas LMS and the Claude Code CLI to power a 4-mode assignment workflow (Think / Draft / Build / Study). The main process owns all filesystem, network, and encrypted-vault work; the renderer is a zinc/plume-green React UI that talks to the main process exclusively through a typed `contextBridge` API named `window.plume`.

**Core data flow:** student clicks a mode button on an assignment → `CanvasPanel` → `startAssignment` IPC → `launcher.ts` writes a `CLAUDE.md` stub + spawns PowerShell → `claude` CLI reads the stub + invokes a bundled `plume-{mode}-workflow` subagent → `SessionPanel` polls the project dir to show live progress.

---

## Module Map

### Main process (`src/main/`)

#### `src/main/index.ts`
- **Purpose:** Electron entry — single-instance lock, window creation with Windows 11 acrylic, menu-bar removal, `ready-to-show` first-paint, bounds persistence on close.
- **Key functions:** `createWindow()`, `validatedBounds(saved)` (clamps to primary display), `resolveWindowIcon()`.
- **Window config:** `frame: true`, `backgroundMaterial: 'acrylic'`, `backgroundColor: '#00000000'`, `minWidth 400, minHeight 300`, `vibrancy: 'under-window'`.
- **Depends on:** `./ipc-handlers`, `./settings`.

#### `src/main/ipc-handlers.ts`
- **Purpose:** Registers every IPC handler (35+ channels). Single entry point `setupIpcHandlers(win)`.
- **Handler groups:** `settings:*`, `canvas:*` (validate/list-courses/list-upcoming/list-announcements/list-instructors/send-message), `launcher:*`, `marketplace:*` (fetch-catalog/install-pack/uninstall-pack), `provider:detect`, `skills:scan`, `library:scan`, `vault:*` (get/set/delete/get-all), `mcp:*` (install/uninstall), `writing-style:*` (list/get/analyze/delete/set-active), `project:*` (list-files/read-file), `app:*` (clear-all-data/check-for-updates), `window:hide`.
- **Depends on:** every other `main/*.ts` module.

#### `src/main/preload.ts`
- **Purpose:** Exposes `window.plume` via `contextBridge.exposeInMainWorld`. Exports `[T] PlumeAPI`.
- **Namespaces:** `settings`, `canvas`, `launcher`, `window`, `provider`, `skills`, `library`, `marketplace`, `mcp`, `vault`, `writingStyle`, `project`, `app`.
- **Listener pattern:** `canvas.onRefresh` and `writingStyle.onProgress` return unsubscribe functions to avoid listener stacking across React remounts.

#### `src/main/settings.ts`
- **Purpose:** `userData/settings.json` persistence; in-memory singleton.
- **Exports:** `[T] Settings`, `[T] WindowBounds`, `[C] DEFAULT_CLAUDE_MD_TEMPLATE` (uses `{{WORKFLOW_MODE_LABEL}}`, `{{WORKFLOW_MODE_HINT}}`, `{{WORKFLOW_AGENT}}` placeholders), `[F] loadSettings`, `[F] saveSettings`, `[F] getSettings`.

#### `src/main/canvas-client.ts`
- **Purpose:** Canvas LMS REST client using native `https`. Handles pagination via `Link: rel="next"` headers.
- **Class `CanvasClient`:** `validateToken`, `listCourses`, `listUpcoming(courseIds)`, `listAnnouncements(courseIds)`, `listInstructors(courseId)`, `sendMessage`, `getAssignmentDetail`.
- **Helpers:** `fetchJson`, `postJson`, `fetchAllPages`, `stripHtml`, `parseLink`.

#### `src/main/launcher.ts`
- **Purpose:** Given an assignment + mode, creates a project dir under `~/claude-projects/<slug>/`, writes `.plume/assignment.json` metadata, writes `CLAUDE.md` by substituting the template, writes a PowerShell launcher that runs `claude` or `claude --resume` depending on a `.started` flag.
- **Exports:** `[T] WorkflowMode = 'think'|'draft'|'build'|'study'`, `[F] launchAssignment(args)`.
- **Key helpers:** `makeProjectDir` (slug + collision detection), `buildWritingStyleBlock` (appends active profile reference).
- **Calls:** `ensureWorkflowAgentsInstalled()` before substitution to guarantee bundled workflow agents are on disk.

#### `src/main/marketplace-client.ts`
- **Purpose:** Fetches the remote marketplace `catalog.json` from GitHub (5s timeout, null on failure → local fallback).
- **Exports:** `[T] RemotePack`, `[T] RemoteMcp`, `[T] RemoteCatalog`, `[F] fetchCatalog()`.

#### `src/main/vault.ts`
- **Purpose:** SQLite-backed encrypted credential store at `~/.claude/plume-vault/vault.db`. Uses Electron `safeStorage` (OS keychain) to encrypt values.
- **Exports:** `[T] VaultCategory`, `[T] MaskedVaultEntry`, `[C] Vault`, `[F] getVault()` (singleton).
- **Methods:** `get(key)`, `set(key, value, label, category)`, `delete(key)`, `getAll()` (returns masked e.g. `ghp_QLJm••••••uRPw`).
- **Native dep:** `better-sqlite3` — must be rebuilt for Electron ABI via `@electron/rebuild`.

#### `src/main/skill-installer.ts`
- **Purpose:** Installs/uninstalls skill packs. Copies `.md` files from `resources/marketplace-skills/` (bundled) → `~/.claude/agents/`.
- **Exports:** `[F] installPack({id, skills})`, `[F] uninstallPack({id, skills})`.
- **Helpers:** `toKebabCase` (skill name → filename), `resolveBundledDir` (dev/prod fallback), `resolveAgentsDir`.

#### `src/main/mcp-installer.ts`
- **Purpose:** Registers/unregisters MCP servers in `~/.claude.json` under `mcpServers`. Atomic write via `.tmp` rename.
- **Exports:** `[F] installMcp({id, configTemplate, credentials})`, `[F] uninstallMcp(id)`.
- **Placeholder substitution:** `${vault:keyName}` in env values → resolved from `credentials` map passed by ipc layer.

#### `src/main/workflow-installer.ts`
- **Purpose:** Ensures all 4 bundled `plume-*-workflow.md` agents are current in `~/.claude/agents/`. Version-stamped overwrite (`# version: N` header).
- **Exports:** `[C] WORKFLOW_FILENAMES` (4 entries), `[F] ensureWorkflowAgentsInstalled()`.
- **Bundled files:** `resources/plume-skills/plume-{think,draft,build,study}-workflow.md`.

#### `src/main/writing-style-analyzer.ts`
- **Purpose:** Spawns `claude --print` subprocess to analyze student writing samples and produce a voice profile. Streams progress lines to renderer.
- **Exports:** `[T] StyleSampleInput`, `[T] AnalyzeArgs`, `[F] analyzeSamples(args, onProgress)`.
- **Output:** Profile markdown saved to `~/.claude/agents/writing-style-{id}.md` AND `~/.claude/plume-styles/{id}/metadata.json`.
- **Subprocess timeout:** 5 minutes.

#### `src/main/writing-style-store.ts`
- **Purpose:** Lists/reads/deletes writing-style profiles from `~/.claude/plume-styles/`.
- **Exports:** `[T] StyleProfileMeta`, `[F] listStyleProfiles`, `[F] getStyleProfile(id)`, `[F] deleteStyleProfile(id)`.

---

### Renderer bridges & state (`src/lib/`)

#### `src/lib/bridge.ts`
- **Purpose:** Typed wrappers around `window.plume.*`. Browser fallbacks so `vite dev` works outside Electron.
- **Exports:** 50+ functions (every IPC channel has a wrapper) + re-exports of `[T] RemoteCatalog`, `[T] LibraryScanResult`, `[T] MaskedVaultEntry`, `[T] ProjectFile`, `[T] StyleProfileMeta`, `[T] StyleSampleInput`, `[T] McpInstallArgs`, etc.
- **Guard helper:** `isElectron()` checks `typeof window.plume !== 'undefined'`.

#### `src/lib/store.ts`
- **Purpose:** Zustand store with `persist` middleware.
- **Exports:** `[T] TabId`, `[T] ActiveSession`, `[T] LivePack`, `[T] LiveMcp`, `[F] useStore`.
- **State:** `activeTab`, `packs`, `mcps`, `catalogFetched`, `catalogLoading`, `activeSession`, `installedPacks` (legacy).
- **Actions:** `setActiveTab`, `refreshCatalog` (fetches + merges remote into local, preserving install state), `installPack`, `removePack`, `installMcp`, `uninstallMcp`, `setActiveSession`.
- **Persistence:** `partialize` stores only `activeTab` + installed IDs; `merge` re-applies install state on rehydrate.

#### `src/lib/marketplace-data.ts`
- **Purpose:** Static local catalog (fallback when remote GitHub fetch fails).
- **Exports:** `[T] SkillPack`, `[T] McpCredential`, `[T] McpConfigTemplate`, `[T] McpServer`, `[D] SKILL_PACKS` (9 packs, 3 pre-installed), `[D] MCP_SERVERS` (19 servers, 5 pre-installed), `[D] CATEGORY_LABELS`, `[D] CATEGORY_COLORS`.
- **Pre-installed packs:** `student-essentials`, `academic-writing`, `code-toolkit`.
- **Pre-installed MCPs:** `canvas-lms`, `google-calendar`, `web-search`, `filesystem`, `git`.

#### `src/lib/format.ts`
- **Exports:** `[T] DueDateStatus`, `[T] FormattedDueDate`, `[F] formatDueDate`, `[F] formatPoints`, `[F] submissionTypeLabel`.

#### `src/lib/canvas-types.ts`
- **Exports:** `[T] Assignment`, `[T] DueGroup`, `[F] getDueGroup`, `[D] COURSE_COLORS` (by subject prefix), `[F] courseColor`.

#### `src/lib/skill-packs.ts` ⚠️ **DEAD — delete**
Legacy emoji-based catalog. No imports anywhere. Superseded by `marketplace-data.ts`.

---

### UI (`src/App.tsx` + `src/components/` + `src/panels/`)

#### `src/App.tsx`
- **Role:** Root router. Renders `<OnboardingOverlay>` until `settings.onboardingComplete`, then `<Shell>` + active panel from `PANELS` map.
- **Store reads:** `activeTab`, `setActiveTab`.
- **Bridge calls:** `getSettings`, `onNavigate`.
- **Tab → component map:** `canvas → CanvasPanel`, `library → LibraryPanel`, `marketplace → MarketplacePanel`, `style → WritingStylePanel`, `session → SessionPanel`, `settings → SettingsPanel`.

#### `src/components/Shell.tsx`
- **Role:** Layout — left rail (brand P + 6 tab icons) + main content. No title bar (native Windows chrome provides it).
- **Props:** `children`, `activeTab`, `onTabClick`.
- **Style:** `bg-zinc-950/60 backdrop-blur-sm` (lets Windows 11 acrylic show through).

#### `src/components/OnboardingOverlay.tsx`
- **Role:** First-run wizard — provider detection (Claude/Codex) + Canvas token validation.
- **Props:** `onComplete`.
- **Bridge calls:** `detectProviders`, `validateCanvasToken`, `getSettings`, `saveSettings`.

#### `src/components/FileDropZone.tsx`
- **Role:** Drag-drop / click-to-browse for writing-style samples. Parses `.txt .md .docx .rtf` in renderer via `mammoth/mammoth.browser`.
- **Props:** `onFiles(samples)`, `maxFiles`, `disabled`.
- **Rejects:** `.pdf` with friendly message.

#### `src/components/canvas/CanvasBadge.tsx`
- **Role:** Colored pill badge for assignment due-date status (overdue/today/this-week/later/no-date).

#### `src/components/TabBar.tsx` ⚠️ **DEAD — delete**
Old horizontal tab bar. Superseded by `Shell` left rail. No imports.

---

### Panels (`src/panels/`)

#### `src/panels/CanvasPanel.tsx`
- **Role:** Main dashboard. Multi-column course view (top 65%: assignments grouped by course, bottom 35%: announcements). Draggable vertical split. Per-assignment expandable card with 4 mode buttons (Think / Draft / Build / Study) + Canvas description (HTML sanitized via `DOMPurify`).
- **Store:** `setActiveSession`, `setActiveTab`.
- **Bridge:** `listCourses`, `listUpcoming`, `listAnnouncements`, `listInstructors`, `sendCanvasMessage`, `startAssignment`, `openProjectDir`, `onCanvasRefresh`, `getSettings`.
- **Mode button flow:** click → `startAssignment({..., mode})` → on success `setActiveSession({projectDir, assignmentName, mode, startedAt})` + `setActiveTab('session')`.

#### `src/panels/LibraryPanel.tsx`
- **Role:** Read-only browser of installed agents / plugins / MCP servers. Scans `~/.claude/agents/`, `~/.claude/plugins/installed_plugins.json`, `~/.claude.json::mcpServers`.
- **Bridge:** `scanLibrary`.

#### `src/panels/MarketplacePanel.tsx`
- **Role:** Install/uninstall skill packs + MCP servers. Search. Refresh remote catalog.
- **Store:** `packs`, `mcps`, `catalogFetched`, `catalogLoading`, `refreshCatalog`, `installPack`, `removePack`, `installMcp`, `uninstallMcp`.
- **MCP install:** inline credential form that submits to vault + `~/.claude.json`.

#### `src/panels/SettingsPanel.tsx`
- **Role:** AI Providers section, Canvas LMS section, Appearance section, Vault manager, Data management (clear all data, check for updates), re-run onboarding.
- **Bridge:** `getSettings`, `saveSettings`, `validateCanvasToken`, `listCourses`, `detectProviders`, `vaultGetAll`, `vaultSet`, `vaultDelete`, `clearAllData`, `checkForUpdates`.

#### `src/panels/WritingStylePanel.tsx`
- **Role:** 3 views — list profiles / create (upload samples → analyze) / detail (show profile markdown). Active-profile selection.
- **Bridge:** `listStyleProfiles`, `getStyleProfile`, `analyzeStyle`, `deleteStyleProfile`, `setActiveStyleProfile`, `onStyleAnalysisProgress`.
- **Uses:** `FileDropZone` for `.txt .md .docx .rtf` uploads.

#### `src/panels/SessionPanel.tsx`
- **Role:** Live file browser + preview for the active assignment session. Polls `listProjectFiles` every 3s, auto-selects newest file on first load and when file count changes. Filters to `.md .txt .py .js .ts .json .csv` (skips binary + `.plume/` meta).
- **Store:** `activeSession`.
- **Bridge:** `listProjectFiles`, `readProjectFile`, `openProjectDir`.

---

## Config Fields Quick Reference

`src/main/settings.ts` — `Settings` interface:

| Field | Type | Default | Effect |
|---|---|---|---|
| `canvasBaseUrl` | `string` | `'https://canvas.uoregon.edu'` | Canvas API base URL |
| `canvasToken` | `string` | `''` | Bearer token (empty = not connected) |
| `canvasCourseIds` | `number[]` | `[]` | Tracked course IDs (empty = auto-discover all) |
| `corner` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` | **Dead field** — was for tray widget |
| `refreshIntervalMinutes` | `number` | `15` | Canvas refresh interval (not currently wired to a timer) |
| `clickAwayToHide` | `boolean` | `true` | **Dead field** — was for tray widget blur handler |
| `claudeMdTemplate` | `string` | see `DEFAULT_CLAUDE_MD_TEMPLATE` | Template used by `launcher.ts` per assignment |
| `preferredProvider` | `'claude' \| 'codex' \| null` | `null` | Which CLI to launch (null = auto-detect) |
| `onboardingComplete` | `boolean` | `false` | Gate — App renders nothing else until true |
| `activeWritingStyleId` | `string \| null` | `null` | Profile ID whose voice block gets appended to every `CLAUDE.md` |
| `windowBounds` | `WindowBounds?` | `undefined` | `{x, y, width, height}` restored across launches |

Template placeholders used by `launcher.ts`: `{{ASSIGNMENT_NAME}}`, `{{COURSE_CODE}}`, `{{DUE_AT}}`, `{{HTML_URL}}`, `{{COURSE_ID}}`, `{{ASSIGNMENT_ID}}`, `{{WORKFLOW_MODE_LABEL}}`, `{{WORKFLOW_MODE_HINT}}`, `{{WORKFLOW_AGENT}}`.

---

## IPC API Surface (`window.plume.*`)

```
settings      get, save
canvas        validateToken, listCourses, listUpcoming, listAnnouncements,
              listInstructors, sendMessage, onRefresh
launcher      startAssignment({..., mode}), openProjectDir
window        hide, onNavigate
provider      detect → {claude, codex}
skills        scan → Array<{name, description, file}>
library       scan → {agents, plugins, mcps}
marketplace   fetchCatalog, installPack({id, skills}), uninstallPack
mcp           install({id, configTemplate, credentials}), uninstall
vault         get, set, delete, getAll (masked)
writingStyle  list, get, analyze, delete, setActive, onProgress
project       listFiles(dir), readFile(filePath)
app           clearAllData, checkForUpdates
```

---

## Resources

### `resources/plume-skills/` — bundled workflow agents
4 subagent markdown files (422 lines total). Each has YAML frontmatter with `name` + `description`, and a `# version: N` header line for update detection.

| File | Lines | Purpose |
|---|---|---|
| `plume-think-workflow.md` | 89 | Deep research briefing (3 parallel research agents → synthesis) |
| `plume-draft-workflow.md` | 102 | Structural template with sections + bullet guides |
| `plume-build-workflow.md` | 109 | Full submission — 3 critique passes + voice style injection |
| `plume-study-workflow.md` | 123 | Practice exam + flashcards + study deck |

### `resources/marketplace-skills/` — bundled skill packs
38 `.md` agent files. Installed to `~/.claude/agents/` when the user clicks **Add** on a pack. See `SKILL_PACKS` in `marketplace-data.ts` for pack → skill-name mappings; `skill-installer.ts::toKebabCase` maps names to filenames.

---

## Data Flow

### A: Assignment launch
```
CanvasPanel mode button click
  → useStore.setActiveSession({projectDir, assignmentName, mode, startedAt})
  → useStore.setActiveTab('session')
  → bridge.startAssignment({courseId, assignmentId, mode, ...})
     → IPC 'launcher:start-assignment'
     → main/launcher.ts::launchAssignment(args)
        ├→ ensureWorkflowAgentsInstalled()  // writes plume-*-workflow.md to ~/.claude/agents/
        ├→ makeProjectDir()                 // ~/claude-projects/<course>-<slug>/
        ├→ write .plume/assignment.json
        ├→ substituteTemplate(settings.claudeMdTemplate, {mode, ...})
        ├→ buildWritingStyleBlock(activeWritingStyleId)
        ├→ write CLAUDE.md
        ├→ write .plume/_launch.ps1
        └→ spawn('pwsh', ['-NoExit', '-File', _launch.ps1], {detached: true})
  → SessionPanel takes over, polls project dir every 3s
```

### B: MCP install with credentials
```
MarketplacePanel.McpCard → expand credential form → submit
  → useStore.installMcp(id, credentials[])
  → bridge.installMcpServer({id, configTemplate, credentials})
  → IPC 'mcp:install'
  → main/ipc-handlers.ts
     ├→ getVault().set(cred.vaultKey, cred.value, ...)   // per credential
     └→ mcp-installer.ts::installMcp({id, configTemplate, credentialsMap})
        ├→ resolvePlaceholders(configTemplate.env, credentialsMap)  // ${vault:key} → actual value
        └→ writeClaudeJsonAtomic(next)                   // ~/.claude.json :: mcpServers
```

### C: Writing style analysis
```
WritingStylePanel create → FileDropZone samples → Analyze
  → bridge.analyzeStyle({name, samples})
  → IPC 'writing-style:analyze' (with win.webContents.send for progress)
  → main/writing-style-analyzer.ts::analyzeSamples
     ├→ writeProfileSkeleton(id, name, samples)          // ~/.claude/plume-styles/{id}/metadata.json
     ├→ spawn('claude', ['--print', ...], {cwd: tempDir})
     │    stdout → win.webContents.send('writing-style:progress', line)
     ├→ finalizeProfile(id, claudeOutput)
     └→ write ~/.claude/agents/writing-style-{id}.md
  → launcher.ts::buildWritingStyleBlock uses settings.activeWritingStyleId on next assignment
```

---

## Known Issues / Dead Code

1. **Delete:** `src/lib/skill-packs.ts` — zero imports, superseded by `marketplace-data.ts`.
2. **Delete:** `src/components/TabBar.tsx` — zero imports, superseded by `Shell.tsx` left rail.
3. **Dead Settings fields:** `corner`, `clickAwayToHide` — leftover from tray-widget era. Leave for backward compat but don't wire them.
4. **`canvas:refresh` event is never emitted.** `preload.ts::canvas.onRefresh` registers a handler, `CanvasPanel` subscribes, but nothing in `ipc-handlers.ts` fires it. Intended as poll wakeup but not wired to `refreshIntervalMinutes`.
5. **No renderer-side MCP credential validation.** If the form is submitted with a missing required credential, `mcp-installer.ts::resolvePlaceholders` returns `{ok: false, missingKey}` and the user sees an error — no pre-submit check.
6. **Vault crashes on unsupported OS.** `Vault` constructor throws if `safeStorage.isEncryptionAvailable()` returns false. No fallback for platforms / configs without OS keychain support.
7. **Single active session globally.** `useStore.activeSession` is one slot — launching a new assignment overwrites the previous session pointer (files still exist on disk, just no UI reference).

---

## Build & Dev

- **`npm run dev`** — Vite on :5173 + `tsc -p tsconfig.main.json` + `electron .` (via `concurrently`)
- **Main process TS:** compiled to `dist/main/` via `tsconfig.main.json`
- **Renderer:** Vite dev server in dev, `loadFile(dist/renderer/index.html)` in prod
- **Native dep:** `better-sqlite3` rebuilt with `npx @electron/rebuild -f -w better-sqlite3` when Electron version changes
- **Docx parsing:** `mammoth/mammoth.browser` (type shim in `src/types/mammoth.d.ts`)
- **HTML sanitization:** `DOMPurify` used in `CanvasPanel` for Canvas assignment descriptions
- **Extra resources** (electron-builder): `resources/marketplace-skills/` + `resources/plume-skills/` bundled into `process.resourcesPath`
