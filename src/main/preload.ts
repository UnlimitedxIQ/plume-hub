import { contextBridge, ipcRenderer } from 'electron'

const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (updates: Record<string, unknown>) => ipcRenderer.invoke('settings:save', updates),
  },
  canvas: {
    validateToken: () => ipcRenderer.invoke('canvas:validate-token'),
    listCourses: () => ipcRenderer.invoke('canvas:list-courses'),
    listUpcoming: () => ipcRenderer.invoke('canvas:list-upcoming'),
    listAnnouncements: () => ipcRenderer.invoke('canvas:list-announcements'),
    listInstructors: (courseId: number) => ipcRenderer.invoke('canvas:list-instructors', courseId),
    sendMessage: (args: { recipientIds: string[]; subject: string; body: string }) =>
      ipcRenderer.invoke('canvas:send-message', args),
    onRefresh: (cb: () => void): (() => void) => {
      const handler = () => cb()
      ipcRenderer.on('canvas:refresh', handler)
      return () => { ipcRenderer.removeListener('canvas:refresh', handler) }
    },
  },
  launcher: {
    startAssignment: (args: {
      courseId: number
      assignmentId: number
      courseCode: string
      assignmentName: string
      htmlUrl: string
      dueAt: string | null
      mode: 'think' | 'draft' | 'build' | 'study' | 'resume'
    }) => ipcRenderer.invoke('launcher:start-assignment', args),
    openProjectDir: (dir: string) => ipcRenderer.invoke('launcher:open-project-dir', dir),
    optimizeSkills: () =>
      ipcRenderer.invoke('launcher:optimize-skills') as Promise<{
        ok: boolean
        workingDir?: string
        error?: string
      }>,
  },
  window: {
    hide: () => ipcRenderer.invoke('window:hide'),
    onNavigate: (cb: (panel: string) => void) => {
      ipcRenderer.on('nav:settings', () => cb('settings'))
    },
  },
  provider: {
    detect: () => ipcRenderer.invoke('provider:detect') as Promise<{ claude: boolean; codex: boolean }>,
  },
  skills: {
    scan: () => ipcRenderer.invoke('skills:scan') as Promise<Array<{ name: string; description: string; file: string }>>,
  },
  library: {
    scan: () => ipcRenderer.invoke('library:scan') as Promise<{
      agents: Array<{ id: string; name: string; description: string; origin: string }>
      plugins: Array<{ id: string; name: string; marketplace: string }>
      mcps: Array<{ id: string; name: string; command: string }>
    }>,
  },
  agents: {
    scanGroups: () => ipcRenderer.invoke('agents:scan-groups') as Promise<{
      ok: boolean
      data?: {
        groups: Array<{
          id: string
          name: string
          skills: Array<{ filename: string; name: string; description: string; enabled: boolean }>
        }>
        ungrouped: Array<{ filename: string; name: string; description: string; enabled: boolean }>
        pluginAgents: Array<{
          plugin: string
          marketplace: string
          agents: Array<{ filename: string; name: string; description: string; plugin: string; marketplace: string }>
        }>
      }
      error?: string
    }>,
    toggleSkill: (args: { filename: string; enabled: boolean }) =>
      ipcRenderer.invoke('agents:toggle-skill', args) as Promise<{ ok: boolean; error?: string }>,
    toggleGroup: (args: { groupId: string; enabled: boolean }) =>
      ipcRenderer.invoke('agents:toggle-group', args) as Promise<{ ok: boolean; moved: number; error?: string }>,
    createGroup: (name: string) =>
      ipcRenderer.invoke('agents:create-group', name) as Promise<{
        ok: boolean
        group?: { id: string; name: string; order: number }
        error?: string
      }>,
    renameGroup: (args: { groupId: string; newName: string }) =>
      ipcRenderer.invoke('agents:rename-group', args) as Promise<{ ok: boolean; error?: string }>,
    deleteGroup: (groupId: string) =>
      ipcRenderer.invoke('agents:delete-group', groupId) as Promise<{ ok: boolean; orphaned: number; error?: string }>,
    assignSkill: (args: { filename: string; groupId: string | null }) =>
      ipcRenderer.invoke('agents:assign-skill', args) as Promise<{ ok: boolean; error?: string }>,
  },
  librarySkills: {
    scan: () =>
      ipcRenderer.invoke('library:scan-skills') as Promise<{
        ok: boolean
        data?: {
          enabled: Array<{
            id: string; name: string; description: string; isDirectory: boolean; enabled: boolean
            origin: { type: 'local' } | { type: 'plugin'; plugin: string; marketplace: string }
          }>
          disabled: Array<{
            id: string; name: string; description: string; isDirectory: boolean; enabled: boolean
            origin: { type: 'local' } | { type: 'plugin'; plugin: string; marketplace: string }
          }>
          plugin: Array<{
            id: string; name: string; description: string; isDirectory: boolean; enabled: boolean
            origin: { type: 'local' } | { type: 'plugin'; plugin: string; marketplace: string }
          }>
        }
        error?: string
      }>,
    toggle: (args: { id: string; enabled: boolean }) =>
      ipcRenderer.invoke('library:toggle-skill', args) as Promise<{ ok: boolean; error?: string }>,
  },
  libraryMcps: {
    scan: () =>
      ipcRenderer.invoke('library:scan-mcps') as Promise<{
        ok: boolean
        data?: Array<{
          name: string; command: string; args: string[]; env: Record<string, string>; type?: string
          origin: { type: 'user' } | { type: 'plugin'; plugin: string; marketplace: string }
        }>
        error?: string
      }>,
    add: (entry: { name: string; command: string; args: string[]; env: Record<string, string>; type?: string }) =>
      ipcRenderer.invoke('library:add-mcp', entry) as Promise<{ ok: boolean; error?: string }>,
    update: (args: {
      originalName: string
      entry: { name: string; command: string; args: string[]; env: Record<string, string>; type?: string }
    }) => ipcRenderer.invoke('library:update-mcp', args) as Promise<{ ok: boolean; error?: string }>,
    remove: (name: string) =>
      ipcRenderer.invoke('library:remove-mcp', name) as Promise<{ ok: boolean; error?: string }>,
  },
  recommendedPlugins: {
    list: () =>
      ipcRenderer.invoke('plugins:list-recommended') as Promise<{
        recommended: string[]
        installed: string[]
      }>,
    ensureMarketplaces: () =>
      ipcRenderer.invoke('plugins:ensure-marketplaces') as Promise<{
        results: Array<{ source: string; ok: boolean; error?: string }>
      }>,
    installOne: (id: string) =>
      ipcRenderer.invoke('plugins:install-one', id) as Promise<{
        ok: boolean
        stdout: string
        stderr: string
        exitCode: number | null
      }>,
  },
  marketplace: {
    fetchCatalog: () => ipcRenderer.invoke('marketplace:fetch-catalog') as Promise<{
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
    } | null>,
    installPack: (pack: { id: string; skills: string[] }) =>
      ipcRenderer.invoke('marketplace:install-pack', pack) as Promise<{
        ok: boolean
        installed: string[]
        skipped: string[]
        error?: string
      }>,
    uninstallPack: (pack: { id: string; skills: string[] }) =>
      ipcRenderer.invoke('marketplace:uninstall-pack', pack) as Promise<{
        ok: boolean
        removed: string[]
        error?: string
      }>,
  },
  mcp: {
    install: (args: {
      id: string
      configTemplate: { command: string; args: string[]; env?: Record<string, string> }
      credentials: Array<{ vaultKey: string; value: string; label: string; category: string }>
    }) =>
      ipcRenderer.invoke('mcp:install', args) as Promise<{ ok: boolean; error?: string }>,
    uninstall: (args: { id: string; vaultKeys?: string[] }) =>
      ipcRenderer.invoke('mcp:uninstall', args) as Promise<{ ok: boolean; error?: string }>,
  },
  vault: {
    get: (key: string) =>
      ipcRenderer.invoke('vault:get', key) as Promise<{ ok: boolean; value: string | null; error?: string }>,
    set: (args: { key: string; value: string; label: string; category: string }) =>
      ipcRenderer.invoke('vault:set', args) as Promise<{ ok: boolean; error?: string }>,
    delete: (key: string) =>
      ipcRenderer.invoke('vault:delete', key) as Promise<{ ok: boolean; removed: boolean; error?: string }>,
    getAll: () =>
      ipcRenderer.invoke('vault:get-all') as Promise<{
        ok: boolean
        entries: Array<{
          key: string
          maskedValue: string
          label: string
          category: string
          createdAt: number
          updatedAt: number
        }>
        error?: string
      }>,
  },
  writingStyle: {
    list: () =>
      ipcRenderer.invoke('writing-style:list') as Promise<{
        ok: boolean
        profiles: Array<{
          id: string
          name: string
          sampleCount: number
          createdAt: number
          analyzedAt: number | null
        }>
        error?: string
      }>,
    get: (id: string) =>
      ipcRenderer.invoke('writing-style:get', id) as Promise<{
        ok: boolean
        profile: {
          id: string
          name: string
          sampleCount: number
          createdAt: number
          analyzedAt: number | null
        } | null
        markdown: string | null
        error?: string
      }>,
    analyze: (args: { name: string; samples: Array<{ filename: string; content: string }> }) =>
      ipcRenderer.invoke('writing-style:analyze', args) as Promise<{
        ok: boolean
        profileId?: string
        profileMarkdown?: string
        error?: string
      }>,
    delete: (id: string) =>
      ipcRenderer.invoke('writing-style:delete', id) as Promise<{ ok: boolean; error?: string }>,
    setActive: (id: string | null) =>
      ipcRenderer.invoke('writing-style:set-active', id) as Promise<{ ok: boolean; error?: string }>,
    // Returns an unsubscribe function — caller must invoke it on cleanup to
    // avoid stacking up listeners on remount.
    onProgress: (cb: (line: string) => void): (() => void) => {
      const handler = (_e: unknown, line: string) => cb(line)
      ipcRenderer.on('writing-style:progress', handler)
      return () => {
        ipcRenderer.removeListener('writing-style:progress', handler)
      }
    },
  },
  project: {
    listFiles: (dir: string) =>
      ipcRenderer.invoke('project:list-files', dir) as Promise<{
        ok: boolean
        files: Array<{ path: string; name: string; size: number; mtime: number }>
        error?: string
      }>,
    readFile: (filePath: string) =>
      ipcRenderer.invoke('project:read-file', filePath) as Promise<{
        ok: boolean
        content: string | null
        error?: string
      }>,
  },
  app: {
    clearAllData: () => ipcRenderer.invoke('app:clear-all-data') as Promise<{ ok: boolean; error?: string }>,
    checkForUpdates: () =>
      ipcRenderer.invoke('app:check-for-updates') as Promise<{
        ok: boolean
        upToDate: boolean
        latestVersion: string
      }>,
  },
}

contextBridge.exposeInMainWorld('plume', api)

export type PlumeAPI = typeof api
