import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SKILL_PACKS as INITIAL_PACKS,
  MCP_SERVERS as INITIAL_MCPS,
  type SkillPack,
  type McpServer,
} from './marketplace-data'
import {
  fetchMarketplaceCatalog,
  installSkillPack,
  uninstallSkillPack,
  installMcpServer,
  uninstallMcpServer,
  type RemoteCatalog,
} from './bridge'

export type TabId = 'canvas' | 'library' | 'marketplace' | 'style' | 'session' | 'settings'

export interface ActiveSession {
  projectDir: string
  assignmentName: string
  mode: string
  startedAt: number
}

// Live packs/mcps carry install state in addition to the static catalog fields
export interface LivePack extends SkillPack {
  installed: boolean
  installing?: boolean
  installError?: string
}

export interface LiveMcp extends McpServer {
  installed: boolean
  installing?: boolean
  installError?: string
}

interface AppState {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void

  // Marketplace
  packs: LivePack[]
  mcps: LiveMcp[]
  catalogFetched: boolean
  catalogLoading: boolean
  refreshCatalog: () => Promise<void>

  // Real disk install: copies bundled .md files from resources/marketplace-skills/
  // into ~/.claude/agents/ (or deletes them on uninstall).
  installPack: (id: string) => Promise<void>
  removePack: (id: string) => Promise<void>

  // MCP install: writes credentials to vault + adds entry to ~/.claude.json
  installMcp: (
    id: string,
    credentials: Array<{ vaultKey: string; value: string; label: string; category: string }>
  ) => Promise<{ ok: boolean; error?: string }>
  uninstallMcp: (id: string) => Promise<{ ok: boolean; error?: string }>

  // Active work session (set when user clicks a mode button)
  activeSession: ActiveSession | null
  setActiveSession: (session: ActiveSession | null) => void

  // Legacy field kept so any other consumers still compile
  installedPacks: string[]
}

// ── Catalog merge ────────────────────────────────────────────────────────────
// Remote metadata (name/description/skills) is authoritative; local install
// state is authoritative. Icons come from the local catalog since the remote
// ships icon *names* (strings) but we render lucide-react components.

function mergePacks(remote: RemoteCatalog['packs'], current: LivePack[]): LivePack[] {
  const installedIds = new Set(current.filter((p) => p.installed).map((p) => p.id))
  return remote.map((r) => {
    const localMatch = INITIAL_PACKS.find((p) => p.id === r.id)
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      icon: localMatch?.icon ?? INITIAL_PACKS[0].icon,
      color: r.color ?? localMatch?.color ?? '#8b5cf6',
      skills: r.skillIds ?? localMatch?.skills ?? [],
      preInstalled: r.preInstalled ?? false,
      installed: (r.preInstalled ?? false) || installedIds.has(r.id),
    }
  })
}

function mergeMcps(remote: RemoteCatalog['mcps'], current: LiveMcp[]): LiveMcp[] {
  const installedIds = new Set(current.filter((m) => m.installed).map((m) => m.id))
  return remote.map((r) => {
    const localMatch = INITIAL_MCPS.find((m) => m.id === r.id)
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      icon: localMatch?.icon ?? INITIAL_MCPS[0].icon,
      category: r.category ?? localMatch?.category ?? 'data',
      preInstalled: r.preInstalled ?? false,
      installed: (r.preInstalled ?? false) || installedIds.has(r.id),
    }
  })
}

// Seed from the local INITIAL_PACKS/INITIAL_MCPS with install=preInstalled
function seedPacks(): LivePack[] {
  return INITIAL_PACKS.map((p) => ({ ...p, installed: p.preInstalled ?? false }))
}

function seedMcps(): LiveMcp[] {
  return INITIAL_MCPS.map((m) => ({ ...m, installed: m.preInstalled ?? false }))
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeTab: 'canvas',
      setActiveTab: (tab) => set({ activeTab: tab }),

      activeSession: null,
      setActiveSession: (session) => set({ activeSession: session }),

      packs: seedPacks(),
      mcps: seedMcps(),
      catalogFetched: false,
      catalogLoading: false,

      refreshCatalog: async () => {
        if (get().catalogLoading) return
        set({ catalogLoading: true })
        try {
          const catalog = await fetchMarketplaceCatalog()
          if (catalog) {
            set({
              packs: mergePacks(catalog.packs, get().packs),
              mcps: mergeMcps(catalog.mcps, get().mcps),
              catalogFetched: true,
            })
          }
        } finally {
          set({ catalogLoading: false })
        }
      },

      installPack: async (id) => {
        const pack = get().packs.find((p) => p.id === id)
        if (!pack) return

        // Flag installing, clear any previous error
        set((s) => ({
          packs: s.packs.map((p) =>
            p.id === id ? { ...p, installing: true, installError: undefined } : p
          ),
        }))

        const result = await installSkillPack({ id: pack.id, skills: pack.skills })

        if (!result.ok) {
          set((s) => ({
            packs: s.packs.map((p) =>
              p.id === id ? { ...p, installing: false, installError: result.error ?? 'Install failed' } : p
            ),
          }))
          return
        }

        set((s) => ({
          packs: s.packs.map((p) =>
            p.id === id ? { ...p, installing: false, installed: true, installError: undefined } : p
          ),
          installedPacks: s.installedPacks.includes(id)
            ? s.installedPacks
            : [...s.installedPacks, id],
        }))
      },

      installMcp: async (id, credentials) => {
        const mcp = get().mcps.find((m) => m.id === id)
        if (!mcp || !mcp.configTemplate) {
          return { ok: false, error: 'No config template' }
        }

        set((s) => ({
          mcps: s.mcps.map((m) =>
            m.id === id ? { ...m, installing: true, installError: undefined } : m
          ),
        }))

        const result = await installMcpServer({
          id: mcp.id,
          configTemplate: mcp.configTemplate,
          credentials,
        })

        if (!result.ok) {
          set((s) => ({
            mcps: s.mcps.map((m) =>
              m.id === id ? { ...m, installing: false, installError: result.error ?? 'Install failed' } : m
            ),
          }))
          return result
        }

        set((s) => ({
          mcps: s.mcps.map((m) =>
            m.id === id ? { ...m, installing: false, installed: true, installError: undefined } : m
          ),
        }))
        return result
      },

      uninstallMcp: async (id) => {
        const mcp = get().mcps.find((m) => m.id === id)
        if (!mcp) return { ok: false, error: 'MCP not found' }

        const vaultKeys = (mcp.requiredCredentials ?? []).map((c) => c.vaultKey)

        set((s) => ({
          mcps: s.mcps.map((m) =>
            m.id === id ? { ...m, installing: true, installError: undefined } : m
          ),
        }))

        const result = await uninstallMcpServer({ id: mcp.id, vaultKeys })

        if (!result.ok) {
          set((s) => ({
            mcps: s.mcps.map((m) =>
              m.id === id ? { ...m, installing: false, installError: result.error ?? 'Uninstall failed' } : m
            ),
          }))
          return result
        }

        set((s) => ({
          mcps: s.mcps.map((m) =>
            m.id === id ? { ...m, installing: false, installed: false, installError: undefined } : m
          ),
        }))
        return result
      },

      removePack: async (id) => {
        const pack = get().packs.find((p) => p.id === id)
        if (!pack) return

        set((s) => ({
          packs: s.packs.map((p) =>
            p.id === id ? { ...p, installing: true, installError: undefined } : p
          ),
        }))

        const result = await uninstallSkillPack({ id: pack.id, skills: pack.skills })

        if (!result.ok) {
          set((s) => ({
            packs: s.packs.map((p) =>
              p.id === id ? { ...p, installing: false, installError: result.error ?? 'Uninstall failed' } : p
            ),
          }))
          return
        }

        set((s) => ({
          packs: s.packs.map((p) =>
            p.id === id ? { ...p, installing: false, installed: false, installError: undefined } : p
          ),
          installedPacks: s.installedPacks.filter((p) => p !== id),
        }))
      },

      installedPacks: [],
    }),
    {
      name: 'plume-hub-store',
      // Only persist install state, not loading flags or full catalog objects
      // (catalog gets re-fetched on app start anyway).
      partialize: (s) =>
        ({
          activeTab: s.activeTab,
          installedPacks: s.installedPacks,
          _installedPackIds: s.packs.filter((p) => p.installed && !p.preInstalled).map((p) => p.id),
          _installedMcpIds: s.mcps.filter((m) => m.installed && !m.preInstalled).map((m) => m.id),
        }) as unknown as AppState,
      // On rehydrate, re-apply install state onto the fresh seed data
      merge: (persisted, current) => {
        const p = persisted as {
          activeTab?: TabId
          installedPacks?: string[]
          _installedPackIds?: string[]
          _installedMcpIds?: string[]
        }
        const installedPackIds = new Set(p._installedPackIds ?? p.installedPacks ?? [])
        const installedMcpIds = new Set(p._installedMcpIds ?? [])
        return {
          ...current,
          activeTab: p.activeTab ?? current.activeTab,
          installedPacks: p.installedPacks ?? [],
          packs: current.packs.map((pack) => ({
            ...pack,
            installed: (pack.preInstalled ?? false) || installedPackIds.has(pack.id),
          })),
          mcps: current.mcps.map((mcp) => ({
            ...mcp,
            installed: (mcp.preInstalled ?? false) || installedMcpIds.has(mcp.id),
          })),
        }
      },
    }
  )
)
