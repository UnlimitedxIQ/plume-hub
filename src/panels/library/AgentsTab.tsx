import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Search, RefreshCw, ChevronDown, Plus, Trash2, Edit2, Check, X,
  FolderOpen, Move, Zap, ZapOff, Loader2, Sparkles,
} from 'lucide-react'
import {
  scanAgentGroups,
  toggleSkill,
  toggleGroup,
  createAgentGroup,
  renameAgentGroup,
  deleteAgentGroup,
  assignSkillToGroup,
  optimizeSkills,
  type GroupedSkills,
  type SkillMeta,
  type AgentGroup,
} from '../../lib/bridge'

export type AgentsTabMode = 'tab' | 'column'

export function AgentsTab({
  mode = 'tab',
  refreshSignal = 0,
}: {
  mode?: AgentsTabMode
  refreshSignal?: number
} = {}) {
  const [data, setData] = useState<GroupedSkills>({ groups: [], ungrouped: [], pluginAgents: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<Set<string>>(new Set())  // skills/groups currently being toggled
  const [creating, setCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameBuffer, setRenameBuffer] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)
  const [optimizing, setOptimizing] = useState(false)

  const isColumn = mode === 'column'

  async function refresh() {
    setLoading(true)
    const result = await scanAgentGroups()
    if (result.ok && result.data) setData(result.data)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [refreshSignal])

  useEffect(() => {
    if (creating) createInputRef.current?.focus()
  }, [creating])

  function markBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function handleToggleSkill(skill: SkillMeta) {
    markBusy(skill.filename, true)
    const result = await toggleSkill({ filename: skill.filename, enabled: !skill.enabled })
    markBusy(skill.filename, false)
    if (result.ok) refresh()
  }

  async function handleToggleGroup(group: AgentGroup, targetEnabled: boolean) {
    const key = `group:${group.id}`
    markBusy(key, true)
    await toggleGroup({ groupId: group.id, enabled: targetEnabled })
    markBusy(key, false)
    refresh()
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim()
    if (!name) return
    setCreating(false)
    setNewGroupName('')
    const result = await createAgentGroup(name)
    if (result.ok) refresh()
  }

  async function handleRename(groupId: string) {
    const name = renameBuffer.trim()
    if (!name) {
      setRenamingId(null)
      return
    }
    setRenamingId(null)
    const result = await renameAgentGroup({ groupId, newName: name })
    if (result.ok) refresh()
  }

  async function handleDeleteGroup(group: AgentGroup) {
    if (!confirm(`Delete group "${group.name}"? Its ${group.skills.length} skill(s) will become ungrouped. Skill files are not deleted.`)) return
    const result = await deleteAgentGroup(group.id)
    if (result.ok) refresh()
  }

  async function handleAssign(filename: string, groupId: string | null) {
    await assignSkillToGroup({ filename, groupId })
    refresh()
  }

  async function handleOptimize() {
    if (optimizing) return
    setOptimizing(true)
    try {
      await optimizeSkills()
    } finally {
      // Give PowerShell a moment to surface before releasing the spinner,
      // so a double-click can't fire two sessions.
      setTimeout(() => setOptimizing(false), 1500)
    }
  }

  // Filter by search — matches skill name/description/filename
  const q = search.trim().toLowerCase()
  const filterSkills = (skills: SkillMeta[]) =>
    q
      ? skills.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.filename.toLowerCase().includes(q)
        )
      : skills

  const filteredGroups = data.groups
    .map((g) => ({ ...g, skills: filterSkills(g.skills) }))
    .filter((g) => !q || g.skills.length > 0 || g.name.toLowerCase().includes(q))

  const filteredUngrouped = filterSkills(data.ungrouped)

  const totalSkills = data.groups.reduce((sum, g) => sum + g.skills.length, 0) + data.ungrouped.length
  const totalEnabled = useMemo(() => {
    let n = 0
    for (const g of data.groups) for (const s of g.skills) if (s.enabled) n++
    for (const s of data.ungrouped) if (s.enabled) n++
    return n
  }, [data])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header — full in tab mode, compact in column mode */}
      {!isColumn ? (
        <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
            <BookOpen size={16} className="text-plume-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-zinc-100">Agents</h2>
            <p className="text-xs text-zinc-500">
              {totalEnabled} of {totalSkills} enabled · {data.groups.length} group{data.groups.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-1.5 focus-within:border-plume-500/50">
            <Search size={12} className="text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-40 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-zinc-500 transition-colors hover:text-zinc-300">×</button>
            )}
          </div>

          <button
            onClick={handleOptimize}
            disabled={optimizing}
            title="Launch Claude to audit every skill, flag redundant ones, and suggest merges"
            className="flex items-center gap-1.5 rounded-lg border border-plume-yellow/50 bg-plume-yellow/10 px-3 py-1.5 text-xs font-semibold text-plume-yellow transition-colors hover:border-plume-yellow hover:bg-plume-yellow/20 disabled:opacity-50"
          >
            {optimizing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {optimizing ? 'Launching…' : 'Optimize Skills'}
          </button>

          <button
            onClick={() => setCreating(true)}
            title="Create new group"
            className="flex items-center gap-1.5 rounded-lg border border-plume-500/40 bg-plume-500/10 px-3 py-1.5 text-xs font-semibold text-plume-300 transition-colors hover:border-plume-500/70 hover:bg-plume-500/20"
          >
            <Plus size={12} /> Group
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
      ) : (
        <div className="flex flex-col gap-2 border-b border-white/8 px-3 py-3">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-plume-400" />
            <span className="text-sm font-bold text-zinc-100">Agents</span>
            <span className="text-[10px] text-zinc-500">
              {totalEnabled}/{totalSkills} · {data.groups.length}g
            </span>
            <button
              onClick={() => setCreating(true)}
              title="Create new group"
              className="ml-auto flex items-center gap-1 rounded-lg border border-plume-500/40 bg-plume-500/10 px-2 py-1 text-[10px] font-semibold text-plume-300 transition-colors hover:bg-plume-500/20"
            >
              <Plus size={10} /> Group
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-1.5 focus-within:border-plume-500/50">
            <Search size={12} className="text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-zinc-500 hover:text-zinc-300">×</button>
            )}
          </div>
        </div>
      )}

      {/* New-group input row */}
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/8 bg-plume-500/5"
          >
            <div className="flex items-center gap-2 px-6 py-3">
              <Plus size={14} className="text-plume-400" />
              <input
                ref={createInputRef}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateGroup()
                  if (e.key === 'Escape') { setCreating(false); setNewGroupName('') }
                }}
                placeholder="Group name (e.g. Video Editing, Writing Skills)"
                className="flex-1 border-b border-plume-500/40 bg-transparent px-1 py-1 text-sm text-zinc-100 outline-none placeholder-zinc-500 focus:border-plume-500"
              />
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="rounded-lg bg-plume-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-plume-600 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => { setCreating(false); setNewGroupName('') }}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Groups + ungrouped */}
      {loading && data.groups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-plume-400" />
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto ${isColumn ? 'px-3 py-3' : 'px-6 py-4'}`}>
          {totalSkills === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <div className={`flex flex-col gap-3 ${isColumn ? '' : 'mx-auto max-w-4xl'}`}>
              {filteredGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  availableGroups={data.groups}
                  busy={busy}
                  renaming={renamingId === group.id}
                  renameBuffer={renameBuffer}
                  onStartRename={() => { setRenamingId(group.id); setRenameBuffer(group.name) }}
                  onCancelRename={() => setRenamingId(null)}
                  onRenameBuffer={setRenameBuffer}
                  onCommitRename={() => handleRename(group.id)}
                  onToggleSkill={handleToggleSkill}
                  onToggleGroup={handleToggleGroup}
                  onDelete={() => handleDeleteGroup(group)}
                  onAssign={handleAssign}
                />
              ))}

              {filteredUngrouped.length > 0 && (
                <UngroupedSection
                  skills={filteredUngrouped}
                  availableGroups={data.groups}
                  busy={busy}
                  onToggleSkill={handleToggleSkill}
                  onAssign={handleAssign}
                />
              )}

              {data.pluginAgents.length > 0 && (
                <PluginAgentsSection groups={data.pluginAgents} search={q} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Plugin agents section ───────────────────────────────────────────────────
// Agents provided by installed plugins. Read-only — enable/disable is managed
// by the plugin's install state, not per-agent.

function PluginAgentsSection({
  groups,
  search,
}: {
  groups: import('../../lib/bridge').PluginAgentGroup[]
  search: string
}) {
  const [expanded, setExpanded] = useState(false)
  const q = search.toLowerCase()
  const filtered = q
    ? groups
        .map((g) => ({
          ...g,
          agents: g.agents.filter(
            (a) =>
              a.name.toLowerCase().includes(q) ||
              a.description.toLowerCase().includes(q) ||
              a.plugin.toLowerCase().includes(q)
          ),
        }))
        .filter((g) => g.agents.length > 0 || g.plugin.toLowerCase().includes(q))
    : groups
  const total = filtered.reduce((n, g) => n + g.agents.length, 0)
  if (q && total === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 border-dashed bg-white/[0.01]">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ChevronDown
          size={14}
          className="text-zinc-500 transition-transform"
          style={{ transform: expanded ? 'rotate(0)' : 'rotate(-90deg)' }}
        />
        <FolderOpen size={14} className="text-amber-400" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-zinc-300">From plugins</span>
          <span className="text-[10px] text-zinc-500">
            {total} agent{total === 1 ? '' : 's'} across {filtered.length} plugin{filtered.length === 1 ? '' : 's'} · read-only
          </span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 bg-zinc-900/20">
              {filtered.map((group) => (
                <div key={`${group.marketplace}/${group.plugin}`} className="border-b border-white/5 last:border-b-0">
                  <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    <span className="text-amber-400">{group.plugin}</span>
                    <span className="text-zinc-700">@ {group.marketplace}</span>
                  </div>
                  {group.agents.map((a) => (
                    <div
                      key={a.filename}
                      className="flex items-center gap-3 border-t border-white/5 px-4 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-[12px] font-medium text-zinc-200">{a.name}</div>
                        {a.description && (
                          <div className="line-clamp-1 text-[10px] text-zinc-500">{a.description}</div>
                        )}
                        <div className="truncate text-[9px] font-mono text-zinc-700">{a.filename}</div>
                      </div>
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-[2px] text-[9px] font-semibold uppercase text-amber-300">
                        plugin
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Group card ──────────────────────────────────────────────────────────────

function GroupCard({
  group,
  availableGroups,
  busy,
  renaming,
  renameBuffer,
  onStartRename,
  onCancelRename,
  onRenameBuffer,
  onCommitRename,
  onToggleSkill,
  onToggleGroup,
  onDelete,
  onAssign,
}: {
  group: AgentGroup
  availableGroups: AgentGroup[]
  busy: Set<string>
  renaming: boolean
  renameBuffer: string
  onStartRename: () => void
  onCancelRename: () => void
  onRenameBuffer: (v: string) => void
  onCommitRename: () => void
  onToggleSkill: (skill: SkillMeta) => void
  onToggleGroup: (group: AgentGroup, enabled: boolean) => void
  onDelete: () => void
  onAssign: (filename: string, groupId: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const enabledCount = group.skills.filter((s) => s.enabled).length
  const allEnabled = enabledCount === group.skills.length && group.skills.length > 0
  const allDisabled = enabledCount === 0
  const someEnabled = enabledCount > 0 && !allEnabled
  const groupKey = `group:${group.id}`
  const groupBusy = busy.has(groupKey)

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      {/* Group header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            size={14}
            className="text-zinc-500 transition-transform"
            style={{ transform: expanded ? 'rotate(0)' : 'rotate(-90deg)' }}
          />
          <FolderOpen size={14} className="text-plume-400" />
          {renaming ? (
            <input
              value={renameBuffer}
              onChange={(e) => onRenameBuffer(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') onCommitRename()
                if (e.key === 'Escape') onCancelRename()
              }}
              autoFocus
              className="border-b border-plume-500/40 bg-transparent px-1 py-0.5 text-sm font-semibold text-zinc-100 outline-none focus:border-plume-500"
            />
          ) : (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-100">{group.name}</span>
              <span className="text-[10px] text-zinc-500">
                {enabledCount} of {group.skills.length} enabled
              </span>
            </div>
          )}
        </button>

        {/* Master toggle */}
        <MasterToggle
          enabled={allEnabled}
          mixed={someEnabled}
          busy={groupBusy}
          onClick={() => onToggleGroup(group, allDisabled ? true : !allEnabled)}
        />

        {/* Menu actions */}
        <div className="flex items-center gap-1">
          {renaming ? (
            <>
              <IconBtn icon={<Check size={12} />} title="Save" onClick={onCommitRename} />
              <IconBtn icon={<X size={12} />} title="Cancel" onClick={onCancelRename} />
            </>
          ) : (
            <>
              <IconBtn icon={<Edit2 size={11} />} title="Rename group" onClick={onStartRename} />
              <IconBtn
                icon={<Trash2 size={11} />}
                title="Delete group"
                onClick={onDelete}
                danger
              />
            </>
          )}
        </div>
      </div>

      {/* Skills list (expanded) */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 bg-zinc-900/20">
              {group.skills.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-zinc-500">
                  No skills in this group. Move skills in from Ungrouped or another group.
                </div>
              ) : (
                group.skills.map((skill) => (
                  <SkillRow
                    key={skill.filename}
                    skill={skill}
                    availableGroups={availableGroups}
                    currentGroupId={group.id}
                    busy={busy.has(skill.filename)}
                    onToggle={onToggleSkill}
                    onAssign={onAssign}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Ungrouped section ───────────────────────────────────────────────────────

function UngroupedSection({
  skills,
  availableGroups,
  busy,
  onToggleSkill,
  onAssign,
}: {
  skills: SkillMeta[]
  availableGroups: AgentGroup[]
  busy: Set<string>
  onToggleSkill: (skill: SkillMeta) => void
  onAssign: (filename: string, groupId: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const enabledCount = skills.filter((s) => s.enabled).length

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 border-dashed bg-white/[0.01]">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ChevronDown
          size={14}
          className="text-zinc-500 transition-transform"
          style={{ transform: expanded ? 'rotate(0)' : 'rotate(-90deg)' }}
        />
        <FolderOpen size={14} className="text-zinc-500" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-zinc-300">Ungrouped</span>
          <span className="text-[10px] text-zinc-500">
            {enabledCount} of {skills.length} enabled · no group assigned
          </span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 bg-zinc-900/20">
              {skills.map((skill) => (
                <SkillRow
                  key={skill.filename}
                  skill={skill}
                  availableGroups={availableGroups}
                  currentGroupId={null}
                  busy={busy.has(skill.filename)}
                  onToggle={onToggleSkill}
                  onAssign={onAssign}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Skill row ───────────────────────────────────────────────────────────────

function SkillRow({
  skill,
  availableGroups,
  currentGroupId,
  busy,
  onToggle,
  onAssign,
}: {
  skill: SkillMeta
  availableGroups: AgentGroup[]
  currentGroupId: string | null
  busy: boolean
  onToggle: (s: SkillMeta) => void
  onAssign: (filename: string, groupId: string | null) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className={`truncate text-[12px] font-medium ${skill.enabled ? 'text-zinc-100' : 'text-zinc-500'}`}>
          {skill.name}
        </div>
        {skill.description && (
          <div className="line-clamp-1 text-[10px] text-zinc-500">{skill.description}</div>
        )}
        <div className="truncate text-[9px] font-mono text-zinc-700">{skill.filename}</div>
      </div>

      {/* Move-to-group menu */}
      <div ref={menuRef} className="relative">
        <IconBtn
          icon={<Move size={11} />}
          title="Move to group"
          onClick={() => setShowMenu((s) => !s)}
        />
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-8 z-10 w-52 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-xl"
            >
              <div className="border-b border-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                Move to
              </div>
              {availableGroups.map((g) => (
                <button
                  key={g.id}
                  disabled={g.id === currentGroupId}
                  onClick={() => {
                    setShowMenu(false)
                    onAssign(skill.filename, g.id)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  <FolderOpen size={11} className="text-plume-400" />
                  <span className="truncate text-zinc-200">{g.name}</span>
                  {g.id === currentGroupId && <Check size={10} className="ml-auto text-plume-400" />}
                </button>
              ))}
              <button
                disabled={currentGroupId === null}
                onClick={() => {
                  setShowMenu(false)
                  onAssign(skill.filename, null)
                }}
                className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5 disabled:opacity-40"
              >
                <span className="truncate text-zinc-400">Ungrouped</span>
                {currentGroupId === null && <Check size={10} className="ml-auto text-plume-400" />}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Individual toggle */}
      <SkillToggle enabled={skill.enabled} busy={busy} onClick={() => onToggle(skill)} />
    </div>
  )
}

// ── Toggle button ───────────────────────────────────────────────────────────

function SkillToggle({ enabled, busy, onClick }: { enabled: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={enabled ? 'Disable this skill' : 'Enable this skill'}
      className={`flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors ${
        enabled
          ? 'border-plume-500/50 bg-plume-500/20 justify-end'
          : 'border-white/10 bg-white/[0.02] justify-start'
      }`}
    >
      {busy ? (
        <Loader2 size={11} className="mx-auto animate-spin text-plume-400" />
      ) : (
        <span
          className={`mx-[2px] flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
            enabled ? 'bg-plume-400 text-plume-900' : 'bg-zinc-600 text-zinc-900'
          }`}
        >
          {enabled ? <Zap size={10} /> : <ZapOff size={10} />}
        </span>
      )}
    </button>
  )
}

function MasterToggle({
  enabled,
  mixed,
  busy,
  onClick,
}: {
  enabled: boolean
  mixed: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={enabled ? 'Disable all in this group' : 'Enable all in this group'}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors ${
        enabled
          ? 'border-plume-500/50 bg-plume-500/15 text-plume-300'
          : mixed
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-zinc-300'
      }`}
    >
      {busy ? (
        <Loader2 size={10} className="animate-spin" />
      ) : enabled ? (
        <Zap size={10} />
      ) : (
        <ZapOff size={10} />
      )}
      {enabled ? 'ALL ON' : mixed ? 'MIXED' : 'ALL OFF'}
    </button>
  )
}

// ── Misc helpers ────────────────────────────────────────────────────────────

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
        danger
          ? 'hover:bg-red-500/10 hover:text-red-400'
          : 'hover:bg-white/5 hover:text-zinc-200'
      }`}
    >
      {icon}
    </button>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-plume-500/10">
        <BookOpen size={22} className="text-plume-400" />
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">No agents yet</div>
        <div className="mt-1 text-xs text-zinc-500">
          Install agents from the Marketplace tab, then come back to organize them.
        </div>
      </div>
      <button
        onClick={onCreate}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-plume-500/40 bg-plume-500/10 px-3 py-1.5 text-xs font-semibold text-plume-300 hover:bg-plume-500/20"
      >
        <Plus size={12} /> Create first group
      </button>
    </div>
  )
}
