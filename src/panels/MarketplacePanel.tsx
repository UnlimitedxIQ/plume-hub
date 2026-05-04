import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Store, Search, Zap, Plug, Plus, Check, ChevronDown, ChevronUp,
  RefreshCw, Loader2, AlertCircle, Key,
} from 'lucide-react'
import { useStore, type LivePack, type LiveMcp } from '../lib/store'
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  USE_CASES,
} from '../lib/marketplace-data'
import { Hero } from '../components/ui'
import { UseCaseCard } from './marketplace/UseCaseCard'

export function MarketplacePanel() {
  const { packs, mcps, catalogFetched, catalogLoading, refreshCatalog, installPack, removePack } = useStore()
  const [search, setSearch] = useState('')
  const [browseAll, setBrowseAll] = useState(false)

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

  // Searching collapses use-cases and shows the catalog directly: search is
  // for power users who already know what they want.
  const showCatalog = browseAll || search.trim().length > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Hero>
        <div className="flex items-center gap-3">
          <h1 className="text-display text-white">What would you like Claude to help with?</h1>
          <div className="flex-1" />

          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 focus-within:border-plumeyellow-400/50">
            <Search size={12} className="text-white/60" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packs and MCPs..."
              className="w-44 bg-transparent text-xs text-white placeholder-white/40 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-white/60 hover:text-white">
                ×
              </button>
            )}
          </div>

          <button
            onClick={refreshCatalog}
            disabled={catalogLoading}
            aria-label={catalogLoading ? 'Refreshing catalog' : catalogFetched ? 'Refresh catalog' : 'Retry catalog fetch'}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-quick ease-quiet disabled:opacity-50 ${
              catalogLoading
                ? 'border-plumeyellow-400/40 text-plumeyellow-400'
                : catalogFetched
                  ? 'border-emerald-400/40 text-emerald-300'
                  : 'border-white/10 text-white/70 hover:border-white/30 hover:text-white'
            }`}
          >
            <RefreshCw size={13} className={catalogLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {!catalogFetched && !catalogLoading && (
          <p className="text-micro text-amber-300/90">Catalog offline. Showing local fallback.</p>
        )}
      </Hero>

      <div className="flex-1 overflow-y-auto p-6">
        {!showCatalog && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {USE_CASES.map((uc) => (
              <UseCaseCard
                key={uc.id}
                useCase={uc}
                packs={packs}
                mcps={mcps}
                onInstallPack={(id) => installPack(id)}
              />
            ))}
          </div>
        )}

        {/* Browse-everything entry point, or the full catalog when search is active. */}
        <div className={showCatalog ? 'mt-0' : 'mt-8 border-t border-subtle pt-6'}>
          {!search.trim() && (
            <button
              onClick={() => setBrowseAll((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-stone-300 hover:text-white"
            >
              {browseAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Browse everything
              <span className="text-micro text-stone-500">
                {filteredPacks.length} packs, {filteredMcps.length} MCPs
              </span>
            </button>
          )}

          {showCatalog && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <CatalogColumn label="Skill packs" icon={<Zap size={11} />} count={filteredPacks.length}>
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
              </CatalogColumn>

              <CatalogColumn label="MCP servers" icon={<Plug size={11} />} count={filteredMcps.length}>
                <div className="grid grid-cols-1 gap-2">
                  {filteredMcps.map((mcp, i) => (
                    <McpCard key={mcp.id} mcp={mcp} index={i} />
                  ))}
                </div>
              </CatalogColumn>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CatalogColumn({
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-subtle surface-1">
      <div className="flex items-center gap-2 border-b border-subtle px-4 py-2.5">
        <span className="text-stone-500">{icon}</span>
        <span className="section-label">{label}</span>
        <span className="rounded-full bg-plume-500/20 px-2 py-[1px] text-micro font-semibold text-plume-300">
          {count}
        </span>
      </div>
      <div className="flex-1 p-3">{children}</div>
    </div>
  )
}

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
      className="overflow-hidden rounded-xl border border-subtle surface-2 transition-colors duration-quick ease-quiet hover:border-strong"
    >
      <div className="flex items-start gap-3 p-3">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${pack.color}18`, border: `1px solid ${pack.color}30` }}
        >
          <Icon size={16} style={{ color: pack.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-0.5 text-sm font-semibold text-stone-100">{pack.name}</div>
          <div className="line-clamp-2 text-xs text-stone-500">{pack.description}</div>
          {pack.installError && (
            <div className="mt-1 flex items-center gap-1 text-micro text-rose-400">
              <AlertCircle size={10} /> {pack.installError}
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

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between border-t border-faint px-3 py-1.5 text-micro font-medium text-stone-500 transition-colors duration-quick ease-quiet hover:bg-white/5"
      >
        <span>{pack.skills.length} skills inside</span>
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      <div className={expanded ? 'row-expanded' : 'row-collapsed'}>
        <div>
          <div className="flex flex-wrap gap-1.5 border-t border-faint px-3 py-2">
            {pack.skills.map((s) => (
              <span
                key={s}
                className="rounded-md border border-subtle bg-white/5 px-1.5 py-[1px] text-micro text-stone-400"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

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
    if (credentials.find((c) => !c.value.trim())) return
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
      className="overflow-hidden rounded-xl border border-subtle surface-2 transition-colors duration-quick ease-quiet hover:border-strong"
    >
      <div className="p-3">
        <div className="mb-1 flex items-start gap-2">
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${categoryColor}15`, border: `1px solid ${categoryColor}30` }}
          >
            <Icon size={12} style={{ color: categoryColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-xs font-semibold text-stone-100">{mcp.name}</div>
            <div className="text-micro font-semibold uppercase tracking-wide" style={{ color: categoryColor }}>
              {CATEGORY_LABELS[mcp.category]}
            </div>
          </div>
          {mcp.preInstalled ? (
            <Check size={11} className="flex-shrink-0 text-emerald-400" />
          ) : mcp.installed ? (
            <button
              onClick={handleRemove}
              disabled={installing}
              className="flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-[1px] text-micro font-semibold text-emerald-400 transition-colors duration-quick ease-quiet hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
            >
              {installing ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} On
            </button>
          ) : canInstall ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              disabled={installing}
              className="flex items-center gap-0.5 rounded border border-plume-500/40 bg-plume-500/15 px-1.5 py-[1px] text-micro font-semibold text-plume-300 transition-colors duration-quick ease-quiet hover:bg-plume-500/25 disabled:opacity-50"
            >
              {installing ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />} Add
            </button>
          ) : (
            <span className="flex items-center gap-0.5 rounded border border-subtle bg-ink-700 px-1.5 py-[1px] text-micro font-semibold text-stone-500">
              Soon
            </span>
          )}
        </div>
        <div className="line-clamp-2 text-micro leading-snug text-stone-500">{mcp.description}</div>
        {mcp.installError && (
          <div className="mt-1 flex items-center gap-1 text-micro text-rose-400">
            <AlertCircle size={10} /> {mcp.installError}
          </div>
        )}
      </div>

      <div className={expanded && canInstall ? 'row-expanded' : 'row-collapsed'}>
        <div>
          <div className="flex flex-col gap-2 border-t border-subtle surface-1 p-3">
            <div className="flex items-center gap-1 text-micro font-semibold uppercase tracking-wide text-stone-500">
              <Key size={10} /> Credentials
            </div>
            {mcp.requiredCredentials?.map((cred) => (
              <div key={cred.vaultKey} className="flex flex-col gap-1">
                <label className="text-micro text-stone-400">{cred.label}</label>
                <input
                  type="password"
                  placeholder={cred.placeholder}
                  value={creds[cred.vaultKey] ?? ''}
                  onChange={(e) =>
                    setCreds((prev) => ({ ...prev, [cred.vaultKey]: e.target.value }))
                  }
                  className="rounded-md border border-subtle bg-ink-800 px-2 py-1 text-xs text-stone-200 outline-none focus:border-plume-500/60"
                />
              </div>
            ))}
            <div className="flex gap-1.5 pt-1">
              <button
                onClick={handleSave}
                disabled={installing}
                className="btn-primary-inline flex-1"
              >
                {installing ? 'Installing...' : 'Save & install'}
              </button>
              <button
                onClick={() => { setExpanded(false); setCreds({}) }}
                className="btn-ghost px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

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
      <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-micro font-semibold text-emerald-400">
        <Check size={11} /> Built-in
      </div>
    )
  }
  if (installing) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-plume-500/40 bg-plume-500/15 px-2 py-1 text-micro font-semibold text-plume-300">
        <Loader2 size={11} className="animate-spin" /> {installed ? 'Removing' : 'Installing'}
      </div>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-micro font-semibold transition-colors duration-quick ease-quiet ${
        installed
          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400'
          : 'border border-plume-500/40 bg-plume-500/15 text-plume-300 hover:bg-plume-500/25'
      }`}
    >
      {installed ? (
        <>
          <Check size={11} /> Installed
        </>
      ) : (
        <>
          <Plus size={11} /> Add
        </>
      )}
    </button>
  )
}
