import { ipcMain, BrowserWindow, shell, app, screen } from 'electron'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { CanvasClient } from './canvas-client'
import { launchAssignment } from './launcher'
import { launchSkillOptimizer } from './skill-optimizer'
import { scanSkills as scanSkillStore, toggleSkill as toggleSkillStore } from './skill-store'
import { scanMcps, addMcp, updateMcp, removeMcp, type McpWriteInput } from './mcp-store'
import {
  listRecommendedPlugins,
  listInstalledPluginIds,
  ensureMarketplacesRegistered,
  installPlugin,
} from './plugin-manager'
import { getSettings, saveSettings } from './settings'
import { fetchCatalog } from './marketplace-client'
import { getVault } from './vault'
import { installPack, uninstallPack } from './skill-installer'
import { installMcp, uninstallMcp, type McpConfigTemplateInput } from './mcp-installer'
import { analyzeSamples, type StyleSampleInput } from './writing-style-analyzer'
import {
  scanAgents as scanAgentGroups,
  toggleSkill as toggleSkillFile,
  toggleGroup as toggleGroupFiles,
  createGroup as createAgentGroup,
  renameGroup as renameAgentGroup,
  deleteGroup as deleteAgentGroup,
  assignSkill as assignSkillToGroup,
} from './agent-groups'
import { listStyleProfiles, getStyleProfile, deleteStyleProfile } from './writing-style-store'

export function setupIpcHandlers(win: BrowserWindow): void {

  // ── Settings ────────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_e, updates: Record<string, unknown>) => {
    saveSettings(updates as Parameters<typeof saveSettings>[0])
    return { ok: true }
  })

  // ── Canvas ───────────────────────────────────────────────────────────────────

  ipcMain.handle('canvas:validate-token', async () => {
    const { canvasBaseUrl, canvasToken } = getSettings()
    if (!canvasToken) return { ok: false, error: 'No token configured' }
    try {
      const client = new CanvasClient(canvasBaseUrl, canvasToken)
      const user = await client.validateToken()
      return { ok: true, user }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('canvas:list-courses', async () => {
    const { canvasBaseUrl, canvasToken } = getSettings()
    if (!canvasToken) return { ok: false, courses: [], error: 'No token' }
    try {
      const client = new CanvasClient(canvasBaseUrl, canvasToken)
      const courses = await client.listCourses()
      return { ok: true, courses }
    } catch (e) {
      return { ok: false, courses: [], error: (e as Error).message }
    }
  })

  ipcMain.handle('canvas:list-upcoming', async () => {
    const { canvasBaseUrl, canvasToken, canvasCourseIds } = getSettings()
    if (!canvasToken) return { ok: false, assignments: [], error: 'No token configured' }
    try {
      const client = new CanvasClient(canvasBaseUrl, canvasToken)

      // Always fetch courses — needed for code enrichment; cache IDs if not yet configured
      const courses = await client.listCourses()
      const courseMap = new Map(courses.map((c) => [c.id, c.courseCode]))

      let courseIds = canvasCourseIds
      if (courseIds.length === 0) {
        courseIds = courses.map((c) => c.id)
        saveSettings({ canvasCourseIds: courseIds })
      }

      const assignments = await client.listUpcoming(courseIds)
      for (const a of assignments) {
        a.courseCode = courseMap.get(a.courseId) ?? `Course ${a.courseId}`
      }

      return { ok: true, assignments }
    } catch (e) {
      return { ok: false, assignments: [], error: (e as Error).message }
    }
  })

  ipcMain.handle('canvas:list-instructors', async (_e, courseId: number) => {
    const { canvasBaseUrl, canvasToken } = getSettings()
    if (!canvasToken) return { ok: false, instructors: [], error: 'No token' }
    try {
      const client = new CanvasClient(canvasBaseUrl, canvasToken)
      const instructors = await client.listInstructors(courseId)
      return { ok: true, instructors }
    } catch (e) {
      return { ok: false, instructors: [], error: (e as Error).message }
    }
  })

  ipcMain.handle('canvas:send-message', async (
    _e,
    args: { recipientIds: string[]; subject: string; body: string }
  ) => {
    const { canvasBaseUrl, canvasToken } = getSettings()
    if (!canvasToken) return { ok: false, error: 'No token' }
    try {
      const client = new CanvasClient(canvasBaseUrl, canvasToken)
      const result = await client.sendMessage(args.recipientIds, args.subject, args.body)
      return { ok: true, id: result.id }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('canvas:list-announcements', async () => {
    const { canvasBaseUrl, canvasToken, canvasCourseIds } = getSettings()
    if (!canvasToken) return { ok: false, announcements: [], error: 'No token' }
    try {
      const client = new CanvasClient(canvasBaseUrl, canvasToken)
      let ids = canvasCourseIds
      if (ids.length === 0) {
        const courses = await client.listCourses()
        ids = courses.map((c) => c.id)
      }
      const announcements = await client.listAnnouncements(ids)
      return { ok: true, announcements }
    } catch (e) {
      return { ok: false, announcements: [], error: (e as Error).message }
    }
  })

  // ── Launcher ─────────────────────────────────────────────────────────────────

  ipcMain.handle('launcher:start-assignment', async (_e, args: {
    courseId: number
    assignmentId: number
    courseCode: string
    assignmentName: string
    htmlUrl: string
    dueAt: string | null
    mode: 'think' | 'draft' | 'build' | 'study'
  }) => {
    try {
      const result = await launchAssignment(args)

      // Snap Plume Hub to the LEFT half of the display it's currently on.
      // The PowerShell launcher snaps itself to the RIGHT half. Both windows
      // extend past the half-width center by WIN11_BORDER pixels to hide
      // Windows 11's invisible resize border.
      //
      // Critically, if the window is fullscreen or maximized, setBounds()
      // silently no-ops because Windows treats those as fixed geometry
      // modes. Exit them first — setFullScreen(false) is async so we await
      // a beat for the animation before the subsequent setBounds sticks.
      try {
        if (win.isMinimized()) win.restore()
        if (win.isFullScreen()) {
          win.setFullScreen(false)
          await new Promise((r) => setTimeout(r, 180))
        }
        if (win.isMaximized()) {
          win.unmaximize()
          await new Promise((r) => setTimeout(r, 60))
        }

        const display = screen.getDisplayMatching(win.getBounds())
        const { workArea } = display
        const halfW = Math.floor(workArea.width / 2)
        const WIN11_BORDER = 7  // invisible resize border at 100% DPI on Win11
        // LEFT half — x starts at workArea.x minus the invisible border so
        // the VISIBLE left edge of the window aligns with the screen edge,
        // and width extends WIN11_BORDER past the center seam on the right.
        win.setBounds({
          x: workArea.x - WIN11_BORDER,
          y: workArea.y,
          width: halfW + WIN11_BORDER * 2,
          height: workArea.height + WIN11_BORDER,
        })
      } catch { /* snap is best-effort; don't block the launch if it fails */ }

      return { ok: true, projectDir: result.projectDir }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('launcher:optimize-skills', async () => {
    try {
      const result = await launchSkillOptimizer()

      // Same snap logic as launcher:start-assignment — Plume LEFT, PS RIGHT.
      try {
        if (win.isMinimized()) win.restore()
        if (win.isFullScreen()) {
          win.setFullScreen(false)
          await new Promise((r) => setTimeout(r, 180))
        }
        if (win.isMaximized()) {
          win.unmaximize()
          await new Promise((r) => setTimeout(r, 60))
        }

        const display = screen.getDisplayMatching(win.getBounds())
        const { workArea } = display
        const halfW = Math.floor(workArea.width / 2)
        const WIN11_BORDER = 7
        win.setBounds({
          x: workArea.x - WIN11_BORDER,
          y: workArea.y,
          width: halfW + WIN11_BORDER * 2,
          height: workArea.height + WIN11_BORDER,
        })
      } catch { /* snap is best-effort */ }

      return { ok: true, workingDir: result.workingDir }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('launcher:open-project-dir', async (_e, dir: string) => {
    const resolved = path.resolve(dir)
    const base = path.resolve(os.homedir(), 'claude-projects')
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      return { ok: false, error: 'Access denied' }
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return { ok: false, error: 'Not a valid directory' }
    }
    await shell.openPath(resolved)
    return { ok: true }
  })

  // ── Marketplace ──────────────────────────────────────────────────────────────

  ipcMain.handle('marketplace:fetch-catalog', async () => {
    const catalog = await fetchCatalog()
    return catalog // null on failure → renderer falls back to local data
  })

  // ── Provider detection ───────────────────────────────────────────────────────

  ipcMain.handle('provider:detect', () => {
    const detect = (cmd: string) => {
      try { execSync(cmd, { stdio: 'ignore' }); return true } catch { return false }
    }
    return {
      claude: detect('where claude'),
      codex: detect('where codex'),
    }
  })

  // ── Skills scan ──────────────────────────────────────────────────────────────

  ipcMain.handle('skills:scan', () => {
    const agentsDir = path.join(os.homedir(), '.claude', 'agents')
    if (!fs.existsSync(agentsDir)) return []
    return fs.readdirSync(agentsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const raw = fs.readFileSync(path.join(agentsDir, f), 'utf-8')
        const match = raw.match(/^---\n([\s\S]*?)\n---/)
        const fm: Record<string, string> = {}
        match?.[1].split('\n').forEach((l) => {
          const idx = l.indexOf(': ')
          if (idx !== -1) fm[l.slice(0, idx).trim()] = l.slice(idx + 2).trim()
        })
        return {
          name: fm['name'] ?? f.replace('.md', ''),
          description: fm['description'] ?? '',
          file: f,
        }
      })
  })

  // ── Library scan: agents + plugins + mcp servers ─────────────────────────────

  ipcMain.handle('library:scan', () => {
    const home = os.homedir()
    const result = {
      agents: [] as Array<{ id: string; name: string; description: string; origin: string }>,
      plugins: [] as Array<{ id: string; name: string; marketplace: string }>,
      mcps: [] as Array<{ id: string; name: string; command: string }>,
    }

    // Agents from ~/.claude/agents/
    const agentsDir = path.join(home, '.claude', 'agents')
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && !f.includes('.sync-conflict'))
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(agentsDir, f), 'utf-8')
          const match = raw.match(/^---\n([\s\S]*?)\n---/)
          const fm: Record<string, string> = {}
          match?.[1].split('\n').forEach((l) => {
            const idx = l.indexOf(': ')
            if (idx !== -1) fm[l.slice(0, idx).trim()] = l.slice(idx + 2).trim()
          })
          result.agents.push({
            id: f,
            name: fm['name'] ?? f.replace('.md', ''),
            description: fm['description'] ?? '',
            origin: 'local',
          })
        } catch { /* skip bad files */ }
      }
    }

    // Installed plugins from ~/.claude/plugins/installed_plugins.json
    const pluginsJson = path.join(home, '.claude', 'plugins', 'installed_plugins.json')
    if (fs.existsSync(pluginsJson)) {
      try {
        const data = JSON.parse(fs.readFileSync(pluginsJson, 'utf-8')) as { plugins?: Record<string, unknown[]> }
        for (const key of Object.keys(data.plugins ?? {})) {
          const [name, marketplace] = key.split('@')
          result.plugins.push({ id: key, name: name ?? key, marketplace: marketplace ?? '' })
        }
      } catch { /* ignore */ }
    }

    // MCP servers from ~/.claude.json
    const claudeJson = path.join(home, '.claude.json')
    if (fs.existsSync(claudeJson)) {
      try {
        const data = JSON.parse(fs.readFileSync(claudeJson, 'utf-8')) as { mcpServers?: Record<string, { command?: string }> }
        for (const [name, cfg] of Object.entries(data.mcpServers ?? {})) {
          result.mcps.push({ id: name, name, command: cfg.command ?? '' })
        }
      } catch { /* ignore */ }
    }

    return result
  })

  // ── Skill groups (agent organization + enable/disable) ───────────────────────
  // Backed by agent-groups.ts:
  //   ~/.claude/agents/              — enabled skills
  //   ~/.claude/plume-disabled-agents/ — disabled skills (hidden from Claude)
  //   ~/.claude/plume-groups.json    — group definitions + filename→group map

  ipcMain.handle('agents:scan-groups', () => {
    try {
      return { ok: true, data: scanAgentGroups() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('agents:toggle-skill', (_e, args: { filename: string; enabled: boolean }) => {
    return toggleSkillFile(args.filename, args.enabled)
  })

  ipcMain.handle('agents:toggle-group', (_e, args: { groupId: string; enabled: boolean }) => {
    return toggleGroupFiles(args.groupId, args.enabled)
  })

  ipcMain.handle('agents:create-group', (_e, name: string) => {
    return createAgentGroup(name)
  })

  ipcMain.handle('agents:rename-group', (_e, args: { groupId: string; newName: string }) => {
    return renameAgentGroup(args.groupId, args.newName)
  })

  ipcMain.handle('agents:delete-group', (_e, groupId: string) => {
    return deleteAgentGroup(groupId)
  })

  ipcMain.handle('agents:assign-skill', (_e, args: { filename: string; groupId: string | null }) => {
    return assignSkillToGroup(args.filename, args.groupId)
  })

  // ── Library: Skills (~/.claude/skills/) ─────────────────────────────────────

  ipcMain.handle('library:scan-skills', () => {
    try {
      return { ok: true, data: scanSkillStore() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('library:toggle-skill', (_e, args: { id: string; enabled: boolean }) => {
    return toggleSkillStore(args.id, args.enabled)
  })

  // ── Library: MCPs (~/.claude.json mcpServers) ───────────────────────────────

  ipcMain.handle('library:scan-mcps', () => {
    try {
      return { ok: true, data: scanMcps() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('library:add-mcp', (_e, entry: McpWriteInput) => {
    return addMcp(entry)
  })

  ipcMain.handle('library:update-mcp', (_e, args: { originalName: string; entry: McpWriteInput }) => {
    return updateMcp(args.originalName, args.entry)
  })

  ipcMain.handle('library:remove-mcp', (_e, name: string) => {
    return removeMcp(name)
  })

  // ── Recommended plugins (bulk install via claude CLI) ───────────────────────

  ipcMain.handle('plugins:list-recommended', () => {
    return { recommended: listRecommendedPlugins(), installed: [...listInstalledPluginIds()] }
  })

  ipcMain.handle('plugins:ensure-marketplaces', async () => {
    return ensureMarketplacesRegistered()
  })

  ipcMain.handle('plugins:install-one', async (_e, id: string) => {
    return installPlugin(id)
  })

  // ── Vault ────────────────────────────────────────────────────────────────────

  ipcMain.handle('vault:get', (_e, key: string) => {
    try {
      return { ok: true, value: getVault().get(key) }
    } catch (e) {
      return { ok: false, value: null, error: (e as Error).message }
    }
  })

  ipcMain.handle('vault:set', (
    _e,
    args: { key: string; value: string; label: string; category: string }
  ) => {
    try {
      getVault().set(args.key, args.value, args.label, args.category)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('vault:delete', (_e, key: string) => {
    try {
      return { ok: true, removed: getVault().delete(key) }
    } catch (e) {
      return { ok: false, removed: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('vault:get-all', () => {
    try {
      return { ok: true, entries: getVault().getAll() }
    } catch (e) {
      return { ok: false, entries: [], error: (e as Error).message }
    }
  })

  // ── Marketplace: install / uninstall skill packs ─────────────────────────────

  ipcMain.handle(
    'marketplace:install-pack',
    (_e, pack: { id: string; skills: string[] }) => installPack(pack)
  )

  ipcMain.handle(
    'marketplace:uninstall-pack',
    (_e, pack: { id: string; skills: string[] }) => uninstallPack(pack)
  )

  // ── MCP install / uninstall ──────────────────────────────────────────────────
  // The renderer collects credential values from the install form and passes
  // them here. This handler writes them to the vault *and* substitutes them
  // into the MCP config template before writing ~/.claude.json.

  ipcMain.handle(
    'mcp:install',
    async (
      _e,
      args: {
        id: string
        configTemplate: McpConfigTemplateInput
        credentials: Array<{ vaultKey: string; value: string; label: string; category: string }>
      }
    ) => {
      try {
        const vault = getVault()
        const credentialsMap: Record<string, string> = {}
        for (const cred of args.credentials) {
          vault.set(cred.vaultKey, cred.value, cred.label, cred.category)
          credentialsMap[cred.vaultKey] = cred.value
        }
        return await installMcp({
          id: args.id,
          configTemplate: args.configTemplate,
          credentials: credentialsMap,
        })
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle(
    'mcp:uninstall',
    async (_e, args: { id: string; vaultKeys?: string[] }) => {
      try {
        if (args.vaultKeys && args.vaultKeys.length > 0) {
          const vault = getVault()
          for (const key of args.vaultKeys) {
            vault.delete(key)
          }
        }
        return await uninstallMcp(args.id)
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  // ── Writing Style ────────────────────────────────────────────────────────────
  // Backend lives in writing-style-analyzer.ts (claude --print subprocess) and
  // writing-style-store.ts (filesystem index of profiles).

  ipcMain.handle('writing-style:list', () => {
    try {
      return { ok: true, profiles: listStyleProfiles() }
    } catch (e) {
      return { ok: false, profiles: [], error: (e as Error).message }
    }
  })

  ipcMain.handle('writing-style:get', (_e, id: string) => {
    try {
      const r = getStyleProfile(id)
      return r
        ? { ok: true, profile: r.profile, markdown: r.markdown }
        : { ok: false, profile: null, markdown: null, error: 'Profile not found' }
    } catch (e) {
      return { ok: false, profile: null, markdown: null, error: (e as Error).message }
    }
  })

  ipcMain.handle(
    'writing-style:analyze',
    async (_e, args: { name: string; samples: StyleSampleInput[] }) => {
      // Stream each subprocess line back to the renderer so the UI can show
      // live progress while Claude is working.
      return analyzeSamples(args, (line) => {
        if (!win.isDestroyed()) {
          win.webContents.send('writing-style:progress', line)
        }
      })
    }
  )

  ipcMain.handle('writing-style:delete', (_e, id: string) => {
    try {
      // After deleting the profile, also clear the active pointer if it was the
      // one being deleted. The renderer doesn't need to know about this side
      // effect — the next list/get call will just see no active id.
      const result = deleteStyleProfile(id)
      const settings = getSettings()
      if (settings.activeWritingStyleId === id) {
        saveSettings({ activeWritingStyleId: null })
      }
      return result
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('writing-style:set-active', (_e, id: string | null) => {
    try {
      saveSettings({ activeWritingStyleId: id })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // ── Project file browsing (for live preview panel) ───────────────────────────

  // Security: only allow access within ~/claude-projects to prevent path traversal
  const ALLOWED_BASE = path.resolve(os.homedir(), 'claude-projects')

  function isPathAllowed(targetPath: string): boolean {
    const resolved = path.resolve(targetPath)
    return resolved.startsWith(ALLOWED_BASE + path.sep) || resolved === ALLOWED_BASE
  }

  ipcMain.handle('project:list-files', (_e, dir: string) => {
    try {
      if (!isPathAllowed(dir)) return { ok: false, files: [], error: 'Access denied' }
      if (!fs.existsSync(dir)) return { ok: false, files: [], error: 'Directory not found' }
      const results: Array<{ path: string; name: string; size: number; mtime: number }> = []

      // Skip noise dirs that would bloat the file list, but keep `.plume/` —
      // that's where Claude saves canvas/assignment.md, rubric_analysis.md,
      // etc. which the Session panel's progress phases rely on.
      const IGNORED_NAMES = new Set(['node_modules', '.git', '.venv', '.vscode', '.idea', '.DS_Store'])

      function walk(current: string, prefix: string) {
        const entries = fs.readdirSync(current, { withFileTypes: true })
        for (const entry of entries) {
          if (IGNORED_NAMES.has(entry.name)) continue
          // Skip dotfiles generally, but allow `.plume` directory through so
          // Claude's saved artifacts (canvas/*, rubric_analysis.md) are visible.
          if (entry.name.startsWith('.') && entry.name !== '.plume') continue
          const full = path.join(current, entry.name)
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name
          if (entry.isDirectory()) {
            walk(full, rel)
          } else {
            const stat = fs.statSync(full)
            results.push({ path: rel, name: entry.name, size: stat.size, mtime: stat.mtimeMs })
          }
        }
      }

      walk(dir, '')
      results.sort((a, b) => b.mtime - a.mtime)
      return { ok: true, files: results }
    } catch (e) {
      return { ok: false, files: [], error: (e as Error).message }
    }
  })

  ipcMain.handle('project:read-file', (_e, filePath: string) => {
    try {
      if (!isPathAllowed(filePath)) return { ok: false, content: null, error: 'Access denied' }
      if (!fs.existsSync(filePath)) return { ok: false, content: null, error: 'File not found' }
      const stat = fs.statSync(filePath)
      if (stat.size > 512 * 1024) return { ok: false, content: null, error: 'File too large for preview (>512KB)' }
      const content = fs.readFileSync(filePath, 'utf-8')
      return { ok: true, content }
    } catch (e) {
      return { ok: false, content: null, error: (e as Error).message }
    }
  })

  // ── App-level actions ────────────────────────────────────────────────────────

  ipcMain.handle('app:clear-all-data', async () => {
    try {
      // 1. Wipe plume-hub settings
      const settingsPath = path.join(app.getPath('userData'), 'settings.json')
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath)

      // 2. Wipe vault database
      const vaultDir = path.join(os.homedir(), '.claude', 'plume-vault')
      if (fs.existsSync(vaultDir)) {
        fs.rmSync(vaultDir, { recursive: true, force: true })
      }

      // 3. Relaunch app for a clean state
      app.relaunch()
      app.exit(0)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('app:check-for-updates', async () => {
    // Placeholder — future work: hit GitHub releases API or Electron autoUpdater
    return { ok: true, upToDate: true, latestVersion: app.getVersion() }
  })

  // ── Window control ───────────────────────────────────────────────────────────

  ipcMain.handle('window:hide', () => {
    win.hide()
  })
}
