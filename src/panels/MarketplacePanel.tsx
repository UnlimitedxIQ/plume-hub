import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Store, Search, Zap, Plug, Plus, Check, ChevronDown, ChevronUp,
  RefreshCw, Cloud, CloudOff, Loader2, AlertCircle, Key,
} from 'lucide-react'
import { useStore, type LivePack, type LiveMcp } from '../lib/store'
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from '../lib/marketplace-data'
import { installMcpServer, uninstallMcpServer } from '../lib/bridge'

export function MarketplacePanel() {
  const { packs, mcps, catalogFetched, catalogLoading, refreshCatalog, installPack, removePack } = useStore()
  const [search, setSearch] = useState('')

  // Refresh catalog on mount. The store guards against concurrent refreshes.
  useEffect(() => {
    refreshCatalog()
  }, [refreshCatalog])

  const q = search.toLowerCase()
  const filteredPacks = packs.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.skills.some((s) => s.toLowerCase().includes(q))
  )
  const filteredMcps = mcps.filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  )

  function togglePack(id: string, installed: boolean) {
    if (installed) removePack(id)
    else installPack(id)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
          <Store size={16} className="text-plume-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-zinc-100">Marketplace</h2>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Install skill packs and MCP servers to extend Claude</span>
            <CatalogStatus fetched={catalogFetched} loading={catalogLoading} />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-1.5 focus-within:border-plume-500/50">
          <Search size={12} className="text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-52 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-zinc-500 transition-colors hover:text-zinc-300">
              ×
            </button>
          )}
        </div>

        <button
          onClick={refreshCatalog}
          disabled={catalogLoading}
          title="Refresh catalog from GitHub"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200 disabled:opacity-50"
        >
          <RefreshCw size={13} className={catalogLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 gap-3 overflow-hidden p-6">
        <Column label="SKILL PACKS" icon={<Zap size={11} />} count={filteredPacks.length}>
          <div className="flex flex-col gap-2">
            {filteredPacks.map((pack, i) => (
              <PackCard
                key={pack.id}
                pack={pack}
                index={i}
                onToggle={() => togglePack(pack.id, pack.installed)}
              />
            ))}
          </div>
        </Column>

        <Column label="MCP SERVERS" icon={<Plug size={11} />} count={filteredMcps.length}>
          <div className="grid grid-cols-2 gap-2">
            {filteredMcps.map((mcp, i) => (
              <McpCard key={mcp.id} mcp={mcp} index={i} />
            ))}
          </div>
        </Column>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({
  label,
  icon,
  count,
  children,
}: {
  label: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="flex w-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="rounded-full bg-plume-500/20 px-2 py-[1px] text-[9px] font-bold text-plume-300">
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

// ── Pack Card ─────────────────────────────────────────────────────────────────

function PackCard({
  pack,
  index,
  onToggle,
}: {
  pack: LivePack
  index: number
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = pack.icon
  const installed = pack.installed
  const installing = pack.installing === true

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/20"
    >
      <div className="flex items-start gap-3 p-3">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${pack.color}18`, border: `1px solid ${pack.color}30` }}
        >
          <Icon size={16} style={{ color: pack.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-0.5 text-sm font-semibold text-zinc-100">{pack.name}</div>
          <div className="line-clamp-2 text-xs text-zinc-500">{pack.description}</div>
          {pack.installError && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400">
              <AlertCircle size={9} /> {pack.installError}
            </div>
          )}
        </div>

        <InstallButton
          installed={installed}
          installing={installing}
          disabled={pack.preInstalled}
          onClick={(e) => {
            e.stopPropagation()
            if (!installing) onToggle()
          }}
        />
      </div>

      {/* Skills list (expandable) */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between border-t border-white/5 px-3 py-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-white/5"
      >
        <span>{pack.skills.length} skills</span>
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 py-2">
              {pack.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-white/10 bg-white/5 px-1.5 py-[1px] text-[10px] text-zinc-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── MCP Card ──────────────────────────────────────────────────────────────────

function McpCard({ mcp, index }: { mcp: LiveMcp; index: number }) {
  const installMcp = useStore((s) => s.installMcp)
  const uninstallMcp = useStore((s) => s.uninstallMcp)

  const [expanded, setExpanded] = useState(false)
  const [creds, setCreds] = useState<Record<string, string>>({})

  const Icon = mcp.icon
  const categoryColor = CATEGORY_COLORS[mcp.category]
  const installing = mcp.installing === true
  const canInstall = !!mcp.configTemplate && (mcp.requiredCredentials?.length ?? 0) > 0

  async function handleSave() {
    if (!mcp.requiredCredentials) return
    const credentials = mcp.requiredCredentials.map((c) => ({
      vaultKey: c.vaultKey,
      value: creds[c.vaultKey] ?? '',
      label: c.label,
      category: c.category,
    }))
    const missing = credentials.find((c) => !c.value.trim())
    if (missing) return
    const result = await installMcp(mcp.id, credentials)
    if (result.ok) {
      setExpanded(false)
      setCreds({})
    }
  }

  async function handleRemove() {
    await uninstallMcp(mcp.id)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/20"
    >
      <div className="p-2.5">
        <div className="mb-1 flex items-start gap-2">
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${categoryColor}15`, border: `1px solid ${categoryColor}30` }}
          >
            <Icon size={12} style={{ color: categoryColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-[11px] font-semibold text-zinc-100">{mcp.name}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: categoryColor }}>
              {CATEGORY_LABELS[mcp.category]}
            </div>
          </div>
          {mcp.preInstalled ? (
            <Check size={11} className="flex-shrink-0 text-emerald-400" />
          ) : mcp.installed ? (
            <button
              onClick={handleRemove}
              disabled={installing}
              className="flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-[1px] text-[9px] font-bold text-emerald-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
            >
              {installing ? <Loader2 size={8} className="animate-spin" /> : <Check size={8} />} ON
            </button>
          ) : canInstall ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              disabled={installing}
              className="flex items-center gap-0.5 rounded border border-plume-500/40 bg-plume-500/15 px-1.5 py-[1px] text-[9px] font-bold text-plume-300 transition-colors hover:bg-plume-500/25 disabled:opacity-50"
            >
              {installing ? <Loader2 size={8} className="animate-spin" /> : <Plus size={8} />} ADD
            </button>
          ) : (
            <span className="flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800/50 px-1.5 py-[1px] text-[9px] font-bold text-zinc-600">
              SOON
            </span>
          )}
        </div>
        <div className="line-clamp-2 text-[10px] leading-snug text-zinc-500">{mcp.description}</div>
        {mcp.installError && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-red-400">
            <AlertCircle size={8} /> {mcp.installError}
          </div>
        )}
      </div>

      {/* Credential form */}
      <AnimatePresence initial={false}>
        {expanded && canInstall && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 border-t border-white/8 bg-zinc-900/60 p-2.5">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                <Key size={9} /> Credentials
              </div>
              {mcp.requiredCredentials?.map((cred) => (
                <div key={cred.vaultKey} className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-400">{cred.label}</label>
                  <input
                    type="password"
                    placeholder={cred.placeholder}
                    value={creds[cred.vaultKey] ?? ''}
                    onChange={(e) =>
                      setCreds((prev) => ({ ...prev, [cred.vaultKey]: e.target.value }))
                    }
                    className="rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1 text-[10px] text-zinc-200 outline-none focus:border-plume-500/60"
                  />
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={handleSave}
                  disabled={installing}
                  className="flex-1 rounded-md bg-plume-500 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-plume-600 disabled:opacity-60"
                >
                  {installing ? 'Installing…' : 'Save & Install'}
                </button>
                <button
                  onClick={() => { setExpanded(false); setCreds({}) }}
                  className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Install Button ────────────────────────────────────────────────────────────

function InstallButton({
  installed,
  installing,
  disabled,
  onClick,
}: {
  installed: boolean
  installing?: boolean
  disabled?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  if (disabled) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">
        <Check size={10} /> BUILT-IN
      </div>
    )
  }
  if (installing) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-plume-500/40 bg-plume-500/15 px-2 py-1 text-[10px] font-bold text-plume-300">
        <Loader2 size={10} className="animate-spin" /> {installed ? 'REMOVING' : 'INSTALLING'}
      </div>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
        installed
          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400'
          : 'border border-plume-500/40 bg-plume-500/15 text-plume-300 hover:bg-plume-500/25'
      }`}
    >
      {installed ? (
        <>
          <Check size={10} /> INSTALLED
        </>
      ) : (
        <>
          <Plus size={10} /> ADD
        </>
      )}
    </button>
  )
}

// ── Catalog Status Pill ───────────────────────────────────────────────────────

function CatalogStatus({ fetched, loading }: { fetched: boolean; loading: boolean }) {
  if (loading) {
    return (
      <span className="flex items-center gap-1 rounded-md border border-plume-500/30 bg-plume-500/10 px-1.5 py-[1px] text-[9px] font-semibold text-plume-400">
        <RefreshCw size={8} className="animate-spin" /> REFRESHING
      </span>
    )
  }
  if (fetched) {
    return (
      <span className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-[1px] text-[9px] font-semibold text-emerald-400">
        <Cloud size={8} /> LIVE
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-1.5 py-[1px] text-[9px] font-semibold text-zinc-500">
      <CloudOff size={8} /> OFFLINE
    </span>
  )
}
