// Type-safe wrappers around window.plume (Electron preload API)
// Falls back to mock data when running in browser (vite dev without electron)

import type { PlumeAPI } from '../main/preload'

declare global {
  interface Window {
    plume?: PlumeAPI
  }
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.plume !== 'undefined'
}

// Settings — fallback shape mirrors Settings interface in main/settings.ts
export const getSettings = () =>
  isElectron()
    ? window.plume!.settings.get()
    : Promise.resolve({
        canvasBaseUrl: 'https://canvas.uoregon.edu',
        canvasToken: '',
        canvasCourseIds: [],
        corner: 'top-right' as const,
        refreshIntervalMinutes: 15,
        clickAwayToHide: true,
        claudeMdTemplate: '',
        preferredProvider: null,
        onboardingComplete: false,
        activeWritingStyleId: null as string | null,
      })

export const saveSettings = (updates: Record<string, unknown>) =>
  isElectron()
    ? window.plume!.settings.save(updates)
    : Promise.resolve({ ok: true })

// Canvas
export const validateCanvasToken = () =>
  isElectron()
    ? window.plume!.canvas.validateToken()
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const listCourses = () =>
  isElectron()
    ? window.plume!.canvas.listCourses()
    : Promise.resolve({ ok: true, courses: [] })

export const listUpcoming = () =>
  isElectron()
    ? window.plume!.canvas.listUpcoming()
    : Promise.resolve({ ok: true, assignments: [] })

export const listAnnouncements = () =>
  isElectron()
    ? window.plume!.canvas.listAnnouncements()
    : Promise.resolve({ ok: true, announcements: [] })

export const listInstructors = (courseId: number) =>
  isElectron()
    ? window.plume!.canvas.listInstructors(courseId)
    : Promise.resolve({ ok: false, instructors: [], error: 'Not in Electron' })

export const sendCanvasMessage = (args: { recipientIds: string[]; subject: string; body: string }) =>
  isElectron()
    ? window.plume!.canvas.sendMessage(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const onCanvasRefresh = (cb: () => void): (() => void) => {
  if (isElectron()) return window.plume!.canvas.onRefresh(cb)
  return () => { /* no-op */ }
}

// Launcher
export const startAssignment = (args: Parameters<PlumeAPI['launcher']['startAssignment']>[0]) =>
  isElectron()
    ? window.plume!.launcher.startAssignment(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const openProjectDir = (dir: string) =>
  isElectron()
    ? window.plume!.launcher.openProjectDir(dir)
    : Promise.resolve({ ok: true })

export const optimizeSkills = () =>
  isElectron()
    ? window.plume!.launcher.optimizeSkills()
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

// Window
export const hideWindow = () => {
  if (isElectron()) window.plume!.window.hide()
}

export const onNavigate = (cb: (panel: string) => void) => {
  if (isElectron()) window.plume!.window.onNavigate(cb)
}

// Provider detection
export const detectProviders = () =>
  isElectron()
    ? window.plume!.provider.detect()
    : Promise.resolve({ claude: false, codex: false })

// Skills scan (single list of agents — legacy)
export const scanSkills = () =>
  isElectron()
    ? window.plume!.skills.scan()
    : Promise.resolve([] as Array<{ name: string; description: string; file: string }>)

// Full library scan: agents + plugins + mcps
export interface ScannedAgent { id: string; name: string; description: string; origin: string }
export interface ScannedPlugin { id: string; name: string; marketplace: string }
export interface ScannedMcp { id: string; name: string; command: string }
export interface LibraryScanResult {
  agents: ScannedAgent[]
  plugins: ScannedPlugin[]
  mcps: ScannedMcp[]
}

export const scanLibrary = (): Promise<LibraryScanResult> =>
  isElectron()
    ? window.plume!.library.scan()
    : Promise.resolve({ agents: [], plugins: [], mcps: [] })

// ── Skill groups (enable/disable + grouping) ────────────────────────────────

export interface SkillMeta {
  filename: string
  name: string
  description: string
  enabled: boolean
}

export interface AgentGroup {
  id: string
  name: string
  skills: SkillMeta[]
}

export interface PluginAgent {
  filename: string
  name: string
  description: string
  plugin: string
  marketplace: string
}

export interface PluginAgentGroup {
  plugin: string
  marketplace: string
  agents: PluginAgent[]
}

export interface GroupedSkills {
  groups: AgentGroup[]
  ungrouped: SkillMeta[]
  pluginAgents: PluginAgentGroup[]
}

export const scanAgentGroups = (): Promise<{ ok: boolean; data?: GroupedSkills; error?: string }> =>
  isElectron()
    ? window.plume!.agents.scanGroups()
    : Promise.resolve({ ok: true, data: { groups: [], ungrouped: [], pluginAgents: [] } })

export const toggleSkill = (args: { filename: string; enabled: boolean }) =>
  isElectron()
    ? window.plume!.agents.toggleSkill(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const toggleGroup = (args: { groupId: string; enabled: boolean }) =>
  isElectron()
    ? window.plume!.agents.toggleGroup(args)
    : Promise.resolve({ ok: false, moved: 0, error: 'Not in Electron' })

export const createAgentGroup = (name: string) =>
  isElectron()
    ? window.plume!.agents.createGroup(name)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const renameAgentGroup = (args: { groupId: string; newName: string }) =>
  isElectron()
    ? window.plume!.agents.renameGroup(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const deleteAgentGroup = (groupId: string) =>
  isElectron()
    ? window.plume!.agents.deleteGroup(groupId)
    : Promise.resolve({ ok: false, orphaned: 0, error: 'Not in Electron' })

export const assignSkillToGroup = (args: { filename: string; groupId: string | null }) =>
  isElectron()
    ? window.plume!.agents.assignSkill(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

// ── Library: Skills ─────────────────────────────────────────────────────────

export type SkillOrigin =
  | { type: 'local' }
  | { type: 'plugin'; plugin: string; marketplace: string }

export interface LibrarySkill {
  id: string
  name: string
  description: string
  isDirectory: boolean
  enabled: boolean
  origin: SkillOrigin
}

export const scanLibrarySkills = (): Promise<{
  ok: boolean
  data?: { enabled: LibrarySkill[]; disabled: LibrarySkill[]; plugin: LibrarySkill[] }
  error?: string
}> =>
  isElectron()
    ? window.plume!.librarySkills.scan()
    : Promise.resolve({ ok: true, data: { enabled: [], disabled: [], plugin: [] } })

export const toggleLibrarySkill = (args: { id: string; enabled: boolean }) =>
  isElectron()
    ? window.plume!.librarySkills.toggle(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

// ── Library: MCPs ───────────────────────────────────────────────────────────

export type McpOrigin =
  | { type: 'user' }
  | { type: 'plugin'; plugin: string; marketplace: string }

export interface LibraryMcp {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  type?: string
  origin: McpOrigin
}

// The shape accepted by add/update — origin is assigned server-side to 'user'.
export type LibraryMcpInput = Omit<LibraryMcp, 'origin'>

export const scanLibraryMcps = (): Promise<{
  ok: boolean
  data?: LibraryMcp[]
  error?: string
}> =>
  isElectron()
    ? window.plume!.libraryMcps.scan()
    : Promise.resolve({ ok: true, data: [] })

export const addLibraryMcp = (entry: LibraryMcpInput) =>
  isElectron()
    ? window.plume!.libraryMcps.add(entry)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const updateLibraryMcp = (args: { originalName: string; entry: LibraryMcpInput }) =>
  isElectron()
    ? window.plume!.libraryMcps.update(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const removeLibraryMcp = (name: string) =>
  isElectron()
    ? window.plume!.libraryMcps.remove(name)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

// ── Recommended plugins (bulk install) ──────────────────────────────────────

export const listRecommendedPlugins = (): Promise<{
  recommended: string[]
  installed: string[]
}> =>
  isElectron()
    ? window.plume!.recommendedPlugins.list()
    : Promise.resolve({ recommended: [], installed: [] })

export const ensurePluginMarketplaces = (): Promise<{
  results: Array<{ source: string; ok: boolean; error?: string }>
}> =>
  isElectron()
    ? window.plume!.recommendedPlugins.ensureMarketplaces()
    : Promise.resolve({ results: [] })

export const installRecommendedPlugin = (id: string): Promise<{
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
}> =>
  isElectron()
    ? window.plume!.recommendedPlugins.installOne(id)
    : Promise.resolve({ ok: false, stdout: '', stderr: 'Not in Electron', exitCode: null })

// Marketplace catalog — fetches from GitHub via main process, null on failure
export interface RemoteCatalog {
  version: string
  lastUpdated: string
  packs: Array<{
    id: string
    name: string
    description: string
    icon: string
    color?: string
    skillIds?: string[]
    mcpIds?: string[]
    preInstalled?: boolean
  }>
  mcps: Array<{
    id: string
    name: string
    description: string
    icon: string
    category?: 'data' | 'productivity' | 'development' | 'ai'
    preInstalled?: boolean
    requiresAccess?: string
    requiredCredentials?: Array<{ vaultKey: string; label: string; placeholder: string; category: string }>
  }>
}

export const fetchMarketplaceCatalog = (): Promise<RemoteCatalog | null> =>
  isElectron()
    ? window.plume!.marketplace.fetchCatalog()
    : Promise.resolve(null)

// ── Skill pack install (bundled → ~/.claude/agents) ─────────────────────────

export interface InstallPackResult {
  ok: boolean
  installed: string[]
  skipped: string[]
  error?: string
}

export interface UninstallPackResult {
  ok: boolean
  removed: string[]
  error?: string
}

export const installSkillPack = (pack: { id: string; skills: string[] }): Promise<InstallPackResult> =>
  isElectron()
    ? window.plume!.marketplace.installPack(pack)
    : Promise.resolve({ ok: false, installed: [], skipped: [], error: 'Not in Electron' })

export const uninstallSkillPack = (pack: { id: string; skills: string[] }): Promise<UninstallPackResult> =>
  isElectron()
    ? window.plume!.marketplace.uninstallPack(pack)
    : Promise.resolve({ ok: false, removed: [], error: 'Not in Electron' })

// ── MCP install / uninstall ─────────────────────────────────────────────────

export interface McpInstallArgs {
  id: string
  configTemplate: { command: string; args: string[]; env?: Record<string, string> }
  credentials: Array<{ vaultKey: string; value: string; label: string; category: string }>
}

export const installMcpServer = (args: McpInstallArgs): Promise<{ ok: boolean; error?: string }> =>
  isElectron()
    ? window.plume!.mcp.install(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const uninstallMcpServer = (args: { id: string; vaultKeys?: string[] }): Promise<{ ok: boolean; error?: string }> =>
  isElectron()
    ? window.plume!.mcp.uninstall(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

// ── Vault ───────────────────────────────────────────────────────────────────

export interface MaskedVaultEntry {
  key: string
  maskedValue: string
  label: string
  category: string
  createdAt: number
  updatedAt: number
}

export const vaultGet = (key: string) =>
  isElectron()
    ? window.plume!.vault.get(key)
    : Promise.resolve({ ok: false, value: null as string | null, error: 'Not in Electron' })

export const vaultSet = (args: { key: string; value: string; label: string; category: string }) =>
  isElectron()
    ? window.plume!.vault.set(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const vaultDelete = (key: string) =>
  isElectron()
    ? window.plume!.vault.delete(key)
    : Promise.resolve({ ok: false, removed: false, error: 'Not in Electron' })

export const vaultGetAll = (): Promise<{ ok: boolean; entries: MaskedVaultEntry[]; error?: string }> =>
  isElectron()
    ? window.plume!.vault.getAll()
    : Promise.resolve({ ok: true, entries: [] })

// ── Project file browsing (live preview) ────────────────────────────────────

export interface ProjectFile {
  path: string
  name: string
  size: number
  mtime: number
}

export const listProjectFiles = (dir: string): Promise<{
  ok: boolean
  files: ProjectFile[]
  error?: string
}> =>
  isElectron()
    ? window.plume!.project.listFiles(dir)
    : Promise.resolve({ ok: true, files: [] })

export const readProjectFile = (filePath: string): Promise<{
  ok: boolean
  content: string | null
  error?: string
}> =>
  isElectron()
    ? window.plume!.project.readFile(filePath)
    : Promise.resolve({ ok: false, content: null, error: 'Not in Electron' })

// ── App-level ───────────────────────────────────────────────────────────────

export const clearAllData = () =>
  isElectron()
    ? window.plume!.app.clearAllData()
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const checkForUpdates = () =>
  isElectron()
    ? window.plume!.app.checkForUpdates()
    : Promise.resolve({ ok: true, upToDate: true, latestVersion: 'dev' })

// ── Writing Style ───────────────────────────────────────────────────────────
// Plume invokes the user's local `claude` CLI in --print mode to do a deep
// analysis of writing samples. The analysis runs in a temp directory; the
// resulting profile.md is copied to ~/.claude/agents/ so Claude Code picks it
// up automatically on every future session.

export interface StyleProfileMeta {
  id: string
  name: string
  sampleCount: number
  createdAt: number
  analyzedAt: number | null
}

export interface StyleSampleInput {
  filename: string
  content: string
}

export const listStyleProfiles = (): Promise<{
  ok: boolean
  profiles: StyleProfileMeta[]
  error?: string
}> =>
  isElectron()
    ? window.plume!.writingStyle.list()
    : Promise.resolve({ ok: true, profiles: [] })

export const getStyleProfile = (id: string): Promise<{
  ok: boolean
  profile: StyleProfileMeta | null
  markdown: string | null
  error?: string
}> =>
  isElectron()
    ? window.plume!.writingStyle.get(id)
    : Promise.resolve({ ok: false, profile: null, markdown: null, error: 'Not in Electron' })

export const analyzeStyle = (args: {
  name: string
  samples: StyleSampleInput[]
}): Promise<{
  ok: boolean
  profileId?: string
  profileMarkdown?: string
  error?: string
}> =>
  isElectron()
    ? window.plume!.writingStyle.analyze(args)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const deleteStyleProfile = (id: string) =>
  isElectron()
    ? window.plume!.writingStyle.delete(id)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

export const setActiveStyleProfile = (id: string | null) =>
  isElectron()
    ? window.plume!.writingStyle.setActive(id)
    : Promise.resolve({ ok: false, error: 'Not in Electron' })

// Streaming progress lines from the analyzer subprocess (each stdout line).
// Returns an unsubscribe function — call it on component unmount to avoid
// stacking listeners across remounts.
export const onStyleAnalysisProgress = (cb: (line: string) => void): (() => void) => {
  if (!isElectron()) return () => { /* no-op */ }
  return window.plume!.writingStyle.onProgress(cb)
}
