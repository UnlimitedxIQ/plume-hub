import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Server, Search, RefreshCw, Plus, Trash2, Edit2, Check, X, Loader2, ChevronDown } from 'lucide-react'
import {
  scanLibraryMcps,
  addLibraryMcp,
  updateLibraryMcp,
  removeLibraryMcp,
  type LibraryMcp,
  type LibraryMcpInput,
} from '../../lib/bridge'
import { classifyMcp, MCP_CATEGORIES, type McpCategory } from '../../lib/topic-classifier'

export type McpsTabMode = 'tab' | 'column'

// Blank entry used for the "+ Add MCP" form.
const EMPTY: LibraryMcpInput = { name: '', command: '', args: [], env: {}, type: 'stdio' }

export function McpsTab({
  mode = 'tab',
  refreshSignal = 0,
}: {
  mode?: McpsTabMode
  refreshSignal?: number
} = {}) {
  const [mcps, setMcps] = useState<LibraryMcp[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)  // name of MCP being edited (or '__new__' for add form)
  const [formError, setFormError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    const result = await scanLibraryMcps()
    if (result.ok && result.data) setMcps(result.data)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [refreshSignal])

  async function handleSubmit(originalName: string | null, entry: LibraryMcpInput) {
    setFormError(null)
    const result = originalName
      ? await updateLibraryMcp({ originalName, entry })
      : await addLibraryMcp(entry)
    if (!result.ok) {
      setFormError(result.error ?? 'Unknown error')
      return
    }
    setEditing(null)
    refresh()
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete MCP "${name}"? Claude Code will lose access to its tools on next start.`)) return
    const result = await removeLibraryMcp(name)
    if (result.ok) refresh()
  }

  const q = search.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? mcps.filter((m) => m.name.toLowerCase().includes(q) || m.command.toLowerCase().includes(q)) : mcps),
    [mcps, q]
  )
  const userScope = useMemo(() => filtered.filter((m) => m.origin.type === 'user'), [filtered])
  const pluginScope = useMemo(() => filtered.filter((m) => m.origin.type === 'plugin'), [filtered])
  const userScopeCount = useMemo(() => mcps.filter((m) => m.origin.type === 'user').length, [mcps])
  const pluginScopeCount = mcps.length - userScopeCount

  const userByCategory = useMemo(() => bucketByCategory(userScope), [userScope])
  const pluginByCategory = useMemo(() => bucketByCategory(pluginScope), [pluginScope])

  const isColumn = mode === 'column'

  function renderMcp(mcp: LibraryMcp) {
    return editing === mcp.name ? (
      <McpForm
        key={mcp.name}
        initial={stripOrigin(mcp)}
        onCancel={() => { setEditing(null); setFormError(null) }}
        onSubmit={(entry) => handleSubmit(mcp.name, entry)}
        error={formError}
      />
    ) : (
      <McpRow
        key={mcp.name}
        mcp={mcp}
        onEdit={() => { setEditing(mcp.name); setFormError(null) }}
        onDelete={() => handleDelete(mcp.name)}
        compact={isColumn}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!isColumn && (
        <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
            <Server size={16} className="text-plume-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-zinc-100">MCP Servers</h2>
            <p className="text-xs text-zinc-500">
              {userScopeCount} user-scope · {pluginScopeCount} from plugins · {mcps.length} total
            </p>
          </div>

          <SearchInput value={search} onChange={setSearch} width="w-40" />

          <button
            onClick={() => { setEditing('__new__'); setFormError(null) }}
            title="Add new MCP server"
            className="flex items-center gap-1.5 rounded-lg border border-plume-500/40 bg-plume-500/10 px-3 py-1.5 text-xs font-semibold text-plume-300 transition-colors hover:border-plume-500/70 hover:bg-plume-500/20"
          >
            <Plus size={12} /> Add MCP
          </button>

          <button
            onClick={refresh}
            disabled={loading}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {isColumn && (
        <ColumnHeader
          icon={<Server size={14} className="text-plume-400" />}
          title="MCPs"
          subtitle={`${userScopeCount} user · ${pluginScopeCount} plugin · ${mcps.length} total`}
          search={search}
          onSearch={setSearch}
          action={
            <button
              onClick={() => { setEditing('__new__'); setFormError(null) }}
              title="Add new MCP server"
              className="flex items-center gap-1 rounded-lg border border-plume-500/40 bg-plume-500/10 px-2 py-1 text-[10px] font-semibold text-plume-300 transition-colors hover:bg-plume-500/20"
            >
              <Plus size={10} /> Add
            </button>
          }
        />
      )}

      {loading && mcps.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-plume-400" />
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto ${isColumn ? 'px-3 py-3' : 'px-6 py-4'}`}>
          <div className={`flex flex-col gap-3 ${isColumn ? '' : 'mx-auto max-w-4xl'}`}>
            <AnimatePresence>
              {editing === '__new__' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <McpForm
                    initial={EMPTY}
                    onCancel={() => { setEditing(null); setFormError(null) }}
                    onSubmit={(entry) => handleSubmit(null, entry)}
                    error={formError}
                    isNew
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {mcps.length === 0 && editing !== '__new__' ? (
              <EmptyState onAdd={() => { setEditing('__new__'); setFormError(null) }} />
            ) : (
              <>
                <SourceCategorySection
                  title={`User-scope (${userScope.length})`}
                  byCategory={userByCategory}
                  renderMcp={renderMcp}
                  defaultOpen
                />
                {pluginScope.length > 0 && (
                  <SourceCategorySection
                    title={`From plugins (${pluginScope.length})`}
                    byCategory={pluginByCategory}
                    renderMcp={renderMcp}
                    dashed
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category bucketing ──────────────────────────────────────────────────────

function bucketByCategory(mcps: LibraryMcp[]): Map<McpCategory, LibraryMcp[]> {
  const out = new Map<McpCategory, LibraryMcp[]>()
  for (const c of MCP_CATEGORIES) out.set(c, [])
  for (const m of mcps) {
    out.get(classifyMcp(m.name))!.push(m)
  }
  return out
}

function SourceCategorySection({
  title,
  byCategory,
  renderMcp,
  defaultOpen,
  dashed,
}: {
  title: string
  byCategory: Map<McpCategory, LibraryMcp[]>
  renderMcp: (mcp: LibraryMcp) => React.ReactNode
  defaultOpen?: boolean
  dashed?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const nonEmpty = MCP_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0)
  if (nonEmpty.length === 0) return null
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white/[0.02] ${
        dashed ? 'border-white/10 border-dashed' : 'border-white/10'
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-b border-white/8 px-3 py-2 text-left"
      >
        <ChevronDown
          size={12}
          className="text-zinc-500 transition-transform"
          style={{ transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}
        />
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{title}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {nonEmpty.map((cat) => (
              <CategoryGroup key={cat} category={cat} mcps={byCategory.get(cat)!} renderMcp={renderMcp} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CategoryGroup({
  category,
  mcps,
  renderMcp,
}: {
  category: McpCategory
  mcps: LibraryMcp[]
  renderMcp: (mcp: LibraryMcp) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ChevronDown
          size={11}
          className="text-zinc-600 transition-transform"
          style={{ transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}
        />
        <span className="text-[11px] font-semibold text-zinc-300">{category}</span>
        <span className="text-[10px] text-zinc-600">({mcps.length})</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="flex flex-col gap-2 px-3 py-2">
              {mcps.map((mcp) => renderMcp(mcp))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SearchInput({
  value,
  onChange,
  width = 'w-full',
}: {
  value: string
  onChange: (v: string) => void
  width?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-1.5 focus-within:border-plume-500/50">
      <Search size={12} className="text-zinc-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        className={`${width} bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none`}
      />
      {value && (
        <button onClick={() => onChange('')} className="text-zinc-500 hover:text-zinc-300">×</button>
      )}
    </div>
  )
}

function ColumnHeader({
  icon,
  title,
  subtitle,
  search,
  onSearch,
  action,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  search: string
  onSearch: (v: string) => void
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/8 px-3 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-bold text-zinc-100">{title}</span>
        <span className="text-[10px] text-zinc-500">{subtitle}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <SearchInput value={search} onChange={onSearch} />
    </div>
  )
}

function McpRow({
  mcp,
  onEdit,
  onDelete,
  compact,
}: {
  mcp: LibraryMcp
  onEdit: () => void
  onDelete: () => void
  compact?: boolean
}) {
  const cmdline = [mcp.command, ...mcp.args].join(' ')
  const envKeys = Object.keys(mcp.env)
  const isPlugin = mcp.origin.type === 'plugin'
  return (
    <div className={`overflow-hidden rounded-lg border bg-white/[0.02] ${isPlugin ? 'border-white/10 border-dashed' : 'border-white/10'}`}>
      <div className={`flex items-start gap-2 ${compact ? 'px-2 py-2' : 'px-4 py-3'}`}>
        <Server size={compact ? 12 : 14} className={`mt-0.5 ${isPlugin ? 'text-amber-400' : 'text-plume-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`font-semibold text-zinc-100 ${compact ? 'text-xs' : 'text-sm'}`}>{mcp.name}</span>
            {!compact && mcp.type && (
              <span className="rounded border border-white/10 px-1.5 py-[1px] text-[9px] font-semibold uppercase text-zinc-500">
                {mcp.type}
              </span>
            )}
            {mcp.origin.type === 'plugin' && (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-[2px] text-[9px] font-semibold uppercase text-amber-300">
                {compact ? 'plugin' : `plugin · ${mcp.origin.plugin}`}
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{cmdline}</div>
          {!compact && envKeys.length > 0 && (
            <div className="mt-1 text-[10px] text-zinc-600">env: {envKeys.join(', ')}</div>
          )}
        </div>
        {!isPlugin && (
          <div className="flex items-center gap-1">
            <IconBtn icon={<Edit2 size={11} />} title="Edit" onClick={onEdit} />
            <IconBtn icon={<Trash2 size={11} />} title="Remove" onClick={onDelete} danger />
          </div>
        )}
      </div>
    </div>
  )
}

function McpForm({
  initial,
  onCancel,
  onSubmit,
  error,
  isNew,
}: {
  initial: LibraryMcpInput
  onCancel: () => void
  onSubmit: (entry: LibraryMcpInput) => void
  error: string | null
  isNew?: boolean
}) {
  const [name, setName] = useState(initial.name)
  const [command, setCommand] = useState(initial.command)
  const [argsText, setArgsText] = useState(initial.args.join(' '))
  const [envText, setEnvText] = useState(
    Object.entries(initial.env).map(([k, v]) => `${k}=${v}`).join('\n')
  )
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const args = argsText.trim() ? splitArgs(argsText.trim()) : []
      const env: Record<string, string> = {}
      for (const line of envText.split('\n')) {
        const eq = line.indexOf('=')
        if (eq === -1) continue
        const k = line.slice(0, eq).trim()
        const v = line.slice(eq + 1).trim()
        if (k) env[k] = v
      }
      await onSubmit({ name: name.trim(), command: command.trim(), args, env, type: initial.type ?? 'stdio' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-plume-500/40 bg-plume-500/5">
      <div className="border-b border-plume-500/20 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-plume-300">
        {isNew ? 'Add MCP server' : `Edit ${initial.name}`}
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-mcp-server"
            className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-plume-500/60"
          />
        </Field>
        <Field label="Command">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="npx"
            className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-plume-500/60"
          />
        </Field>
        <Field label="Args (space-separated, quote values with spaces)">
          <input
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            placeholder='-y @some/package --flag "value with spaces"'
            className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-plume-500/60"
          />
        </Field>
        <Field label="Environment variables (one KEY=VALUE per line)">
          <textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            rows={Math.max(2, envText.split('\n').length)}
            placeholder="API_KEY=sk-..."
            className="w-full resize-none rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-plume-500/60"
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/5"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || !command.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-plume-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-plume-600 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

function IconBtn({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors ${
        danger ? 'hover:bg-red-500/10 hover:text-red-400' : 'hover:bg-white/5 hover:text-zinc-200'
      }`}
    >
      {icon}
    </button>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-plume-500/10">
        <Server size={22} className="text-plume-400" />
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">No MCP servers yet</div>
        <div className="mt-1 max-w-sm text-xs text-zinc-500">
          Add an MCP server to give Claude Code tools from a local or remote process.
        </div>
      </div>
      <button
        onClick={onAdd}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-plume-500/40 bg-plume-500/10 px-3 py-1.5 text-xs font-semibold text-plume-300 hover:bg-plume-500/20"
      >
        <Plus size={12} /> Add first MCP
      </button>
    </div>
  )
}

function stripOrigin(m: LibraryMcp): LibraryMcpInput {
  const { origin: _origin, ...rest } = m
  return rest
}

// Simple shell-style arg splitter: whitespace is a separator, but double-quoted
// substrings are kept intact. Good enough for the common MCP command shapes.
function splitArgs(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '"') { inQuote = !inQuote; continue }
    if (!inQuote && /\s/.test(c)) {
      if (cur) { out.push(cur); cur = '' }
      continue
    }
    cur += c
  }
  if (cur) out.push(cur)
  return out
}
