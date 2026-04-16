import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2, Search, RefreshCw, Loader2, Zap, ZapOff, Folder, FileText, ChevronDown } from 'lucide-react'
import { scanLibrarySkills, toggleLibrarySkill, type LibrarySkill } from '../../lib/bridge'
import { classifySkill, SKILL_TOPICS, type SkillTopic } from '../../lib/topic-classifier'

export type SkillsTabMode = 'tab' | 'column'

export function SkillsTab({
  mode = 'tab',
  refreshSignal = 0,
}: {
  mode?: SkillsTabMode
  refreshSignal?: number
} = {}) {
  const [skills, setSkills] = useState<{
    enabled: LibrarySkill[]
    disabled: LibrarySkill[]
    plugin: LibrarySkill[]
  }>({
    enabled: [],
    disabled: [],
    plugin: [],
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<Set<string>>(new Set())

  async function refresh() {
    setLoading(true)
    const result = await scanLibrarySkills()
    if (result.ok && result.data) setSkills(result.data)
    setLoading(false)
  }

  // Re-scan whenever the parent bumps refreshSignal (shared "refresh all" btn).
  useEffect(() => { refresh() }, [refreshSignal])

  function markBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function handleToggle(skill: LibrarySkill) {
    markBusy(skill.id, true)
    const result = await toggleLibrarySkill({ id: skill.id, enabled: !skill.enabled })
    markBusy(skill.id, false)
    if (result.ok) refresh()
  }

  const q = search.trim().toLowerCase()
  const filter = (arr: LibrarySkill[]) =>
    q
      ? arr.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q)
        )
      : arr

  const filteredLocal = useMemo(
    () => filter([...skills.enabled, ...skills.disabled]),
    [skills, q]
  )
  const filteredPlugin = useMemo(() => filter(skills.plugin), [skills, q])

  // Pre-bucket by topic so each <SourceSection> doesn't re-classify on re-render.
  const localByTopic = useMemo(() => bucketByTopic(filteredLocal), [filteredLocal])
  const pluginByTopic = useMemo(() => bucketByTopic(filteredPlugin), [filteredPlugin])

  const totalEnabled = skills.enabled.length
  const totalAll = totalEnabled + skills.disabled.length + skills.plugin.length

  const isColumn = mode === 'column'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!isColumn && (
        <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
            <Wand2 size={16} className="text-plume-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-zinc-100">Skills</h2>
            <p className="text-xs text-zinc-500">
              {totalEnabled} local enabled · {skills.plugin.length} from plugins · {totalAll} total
            </p>
          </div>

          <SearchInput value={search} onChange={setSearch} width="w-40" />

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
          icon={<Wand2 size={14} className="text-plume-400" />}
          title="Skills"
          subtitle={`${totalEnabled} local · ${skills.plugin.length} plugin · ${totalAll} total`}
          search={search}
          onSearch={setSearch}
        />
      )}

      {loading && totalAll === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-plume-400" />
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto ${isColumn ? 'px-3 py-3' : 'px-6 py-4'}`}>
          {totalAll === 0 ? (
            <EmptyState />
          ) : (
            <div className={`flex flex-col gap-3 ${isColumn ? '' : 'mx-auto max-w-4xl'}`}>
              <SourceSection
                title={`Local (${filteredLocal.length})`}
                byTopic={localByTopic}
                busy={busy}
                onToggle={handleToggle}
                defaultOpen
              />
              {filteredPlugin.length > 0 && (
                <SourceSection
                  title={`From plugins (${filteredPlugin.length})`}
                  byTopic={pluginByTopic}
                  busy={busy}
                  onToggle={handleToggle}
                  dashed
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Topic bucketing ─────────────────────────────────────────────────────────

function bucketByTopic(skills: LibrarySkill[]): Map<SkillTopic, LibrarySkill[]> {
  const out = new Map<SkillTopic, LibrarySkill[]>()
  for (const t of SKILL_TOPICS) out.set(t, [])
  for (const s of skills) {
    const topic = classifySkill(s.name, s.description)
    out.get(topic)!.push(s)
  }
  return out
}

// ── Source-level section (Local / From plugins) ─────────────────────────────

function SourceSection({
  title,
  byTopic,
  busy,
  onToggle,
  defaultOpen,
  dashed,
}: {
  title: string
  byTopic: Map<SkillTopic, LibrarySkill[]>
  busy: Set<string>
  onToggle: (s: LibrarySkill) => void
  defaultOpen?: boolean
  dashed?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const nonEmptyTopics = SKILL_TOPICS.filter((t) => (byTopic.get(t)?.length ?? 0) > 0)
  if (nonEmptyTopics.length === 0) return null

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
            {nonEmptyTopics.map((topic) => (
              <TopicGroup
                key={topic}
                topic={topic}
                skills={byTopic.get(topic)!}
                busy={busy}
                onToggle={onToggle}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Topic group inside a source ─────────────────────────────────────────────

function TopicGroup({
  topic,
  skills,
  busy,
  onToggle,
}: {
  topic: SkillTopic
  skills: LibrarySkill[]
  busy: Set<string>
  onToggle: (s: LibrarySkill) => void
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
        <span className="text-[11px] font-semibold text-zinc-300">{topic}</span>
        <span className="text-[10px] text-zinc-600">({skills.length})</span>
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
            {skills.map((s) => (
              <SkillRow key={`${originKey(s)}:${s.id}`} skill={s} busy={busy.has(s.id)} onToggle={onToggle} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function originKey(s: LibrarySkill): string {
  return s.origin.type === 'local' ? 'local' : `plugin:${s.origin.marketplace}/${s.origin.plugin}`
}

// ── Row ─────────────────────────────────────────────────────────────────────

function SkillRow({
  skill,
  busy,
  onToggle,
}: {
  skill: LibrarySkill
  busy: boolean
  onToggle: (s: LibrarySkill) => void
}) {
  const Icon = skill.isDirectory ? Folder : FileText
  const isPlugin = skill.origin.type === 'plugin'
  return (
    <div className="flex items-center gap-2 border-t border-white/5 px-4 py-2">
      <Icon size={12} className={skill.enabled ? (isPlugin ? 'text-amber-400' : 'text-plume-400') : 'text-zinc-600'} />
      <div className="flex-1 min-w-0">
        <div className={`truncate text-[11px] font-medium ${!skill.enabled ? 'text-zinc-500' : 'text-zinc-100'}`}>
          {skill.name}
        </div>
        {skill.description && (
          <div className="line-clamp-1 text-[10px] text-zinc-500">{skill.description}</div>
        )}
        {skill.origin.type === 'plugin' && (
          <div className="truncate text-[9px] font-mono text-amber-500/60">{skill.origin.plugin}</div>
        )}
      </div>
      {isPlugin ? (
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-[2px] text-[9px] font-semibold uppercase text-amber-300">
          plugin
        </span>
      ) : (
        <SkillToggle enabled={skill.enabled} busy={busy} onClick={() => onToggle(skill)} />
      )}
    </div>
  )
}

function SkillToggle({ enabled, busy, onClick }: { enabled: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={enabled ? 'Disable this skill' : 'Enable this skill'}
      className={`flex h-6 w-10 flex-shrink-0 items-center rounded-full border transition-colors ${
        enabled ? 'border-plume-500/50 bg-plume-500/20 justify-end' : 'border-white/10 bg-white/[0.02] justify-start'
      }`}
    >
      {busy ? (
        <Loader2 size={10} className="mx-auto animate-spin text-plume-400" />
      ) : (
        <span
          className={`mx-[2px] flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
            enabled ? 'bg-plume-400 text-plume-900' : 'bg-zinc-600 text-zinc-900'
          }`}
        >
          {enabled ? <Zap size={8} /> : <ZapOff size={8} />}
        </span>
      )}
    </button>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────────

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
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  search: string
  onSearch: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/8 px-3 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-bold text-zinc-100">{title}</span>
        <span className="text-[10px] text-zinc-500">{subtitle}</span>
      </div>
      <SearchInput value={search} onChange={onSearch} />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-plume-500/10">
        <Wand2 size={22} className="text-plume-400" />
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">No skills yet</div>
        <div className="mt-1 max-w-sm text-xs text-zinc-500">
          Drop SKILL.md files or directories into <span className="font-mono">~/.claude/skills/</span> and they'll appear here.
        </div>
      </div>
    </div>
  )
}
