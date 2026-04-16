import React, { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText, FolderOpen, RefreshCw, Clock, Eye, ChevronDown,
  PenLine, Search, BookOpen, Target, Settings, Check, Circle,
  FileSearch, ClipboardList, Sparkles, Trophy,
} from 'lucide-react'
import { useStore, type ActiveSession } from '../lib/store'
import {
  listProjectFiles,
  readProjectFile,
  openProjectDir,
  type ProjectFile,
} from '../lib/bridge'

const POLL_INTERVAL = 3000

// ── Categorization ────────────────────────────────────────────────────────────
// Files are bucketed into categories based on their relative path. Meta files
// (CLAUDE.md, .plume/config, launch script, .started flag) get collapsed by
// default since the student doesn't need them.

type CategoryId = 'drafts' | 'research' | 'study' | 'analysis' | 'other' | 'meta'

interface CategoryDef {
  id: CategoryId
  label: string
  Icon: React.ElementType
  color: string
  matches: (relPath: string) => boolean
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'drafts',
    label: 'Drafts',
    Icon: PenLine,
    color: 'text-amber-400',
    matches: (p) => p.startsWith('drafts/') || p.startsWith('drafts\\'),
  },
  {
    id: 'research',
    label: 'Research',
    Icon: Search,
    color: 'text-blue-400',
    matches: (p) => p.startsWith('research/') || p.startsWith('research\\'),
  },
  {
    id: 'study',
    label: 'Study Materials',
    Icon: BookOpen,
    color: 'text-purple-400',
    matches: (p) => p.startsWith('study/') || p.startsWith('study\\'),
  },
  {
    id: 'analysis',
    label: 'Analysis',
    Icon: Target,
    color: 'text-emerald-400',
    matches: (p) => {
      const isPlume = p.startsWith('.plume/') || p.startsWith('.plume\\')
      if (!isPlume) return false
      // Only user-relevant .plume/ files — not the config/launcher/flag
      return (
        p.includes('rubric_analysis') ||
        p.includes('canvas/assignment') ||
        p.includes('canvas\\assignment') ||
        p.includes('canvas/rubric') ||
        p.includes('canvas\\rubric') ||
        p.includes('research_brief') ||
        p.includes('outline')
      )
    },
  },
  {
    id: 'meta',
    label: 'Meta',
    Icon: Settings,
    color: 'text-zinc-500',
    matches: (p) => {
      // Everything inside .plume/ that we didn't claim for Analysis,
      // plus CLAUDE.md itself.
      if (p === 'CLAUDE.md') return true
      if (p.startsWith('.plume/') || p.startsWith('.plume\\')) return true
      return false
    },
  },
  {
    id: 'other',
    label: 'Other',
    Icon: FileText,
    color: 'text-zinc-400',
    matches: () => true, // catch-all
  },
]

function categorize(files: ProjectFile[]): Record<CategoryId, ProjectFile[]> {
  const buckets: Record<CategoryId, ProjectFile[]> = {
    drafts: [], research: [], study: [], analysis: [], other: [], meta: [],
  }
  for (const f of files) {
    // Normalize path separators once for stable matching
    const path = f.path.replace(/\\/g, '/')
    // First match wins — 'other' is last so it catches anything unclaimed
    for (const cat of CATEGORIES) {
      if (cat.matches(path)) {
        buckets[cat.id].push(f)
        break
      }
    }
  }
  return buckets
}

// ── Progress phases ───────────────────────────────────────────────────────────
// Each phase maps to a predicate over the file list. A phase is "done" if any
// file in the project matches. Phases stay sequential — this is a rough
// workflow order, not a strict state machine.

interface PhaseDef {
  id: string
  label: string
  Icon: React.ElementType
  matches: (files: ProjectFile[]) => boolean
}

const PHASES: PhaseDef[] = [
  {
    id: 'read',
    label: 'Read assignment',
    Icon: FileSearch,
    matches: (fs) =>
      fs.some((f) => {
        const p = f.path.replace(/\\/g, '/')
        return p.includes('canvas/assignment') || p.includes('canvas/rubric')
      }),
  },
  {
    id: 'rubric',
    label: 'Rubric analyzed',
    Icon: ClipboardList,
    matches: (fs) => fs.some((f) => f.path.replace(/\\/g, '/').includes('rubric_analysis')),
  },
  {
    id: 'research',
    label: 'Research',
    Icon: Search,
    matches: (fs) => fs.some((f) => f.path.replace(/\\/g, '/').startsWith('research/')),
  },
  {
    id: 'draft',
    label: 'First draft',
    Icon: PenLine,
    matches: (fs) =>
      fs.some((f) => {
        const p = f.path.replace(/\\/g, '/')
        return p.includes('draft_v1') || p.startsWith('study/')
      }),
  },
  {
    id: 'critique',
    label: 'Critique',
    Icon: Sparkles,
    matches: (fs) => fs.some((f) => f.path.replace(/\\/g, '/').includes('critique')),
  },
  {
    id: 'final',
    label: 'Final draft',
    Icon: Trophy,
    matches: (fs) =>
      fs.some((f) => {
        const p = f.path.replace(/\\/g, '/')
        return p.includes('draft_v2') || p.includes('final')
      }),
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionPanel() {
  const session = useStore((s) => s.activeSession)

  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Eye size={32} className="text-zinc-600" />
        <p className="text-base font-medium text-zinc-300">No active session</p>
        <p className="max-w-sm text-sm text-zinc-500">
          Click a mode button (Think / Draft / Build / Study) on any Canvas assignment to start a session. The live preview will appear here.
        </p>
      </div>
    )
  }

  return <ActiveSessionView session={session} />
}

// Returns the file that should be auto-selected. Prefers recent user-facing
// artifacts (drafts > study > research > analysis > other) over meta files.
function pickAutoFile(files: ProjectFile[]): ProjectFile | null {
  const buckets = categorize(files)
  const order: CategoryId[] = ['drafts', 'study', 'research', 'analysis', 'other']
  for (const cat of order) {
    if (buckets[cat].length > 0) {
      // Sorted desc by mtime by the upstream listProjectFiles
      return buckets[cat][0]
    }
  }
  // Fall through to meta if that's all that exists
  if (buckets.meta.length > 0) return buckets.meta[0]
  return null
}

function ActiveSessionView({ session }: { session: ActiveSession }) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [metaOpen, setMetaOpen] = useState(false)
  const userSelectedRef = useRef(false) // once user clicks a file, stop auto-switching
  const lastAutoPath = useRef<string | null>(null)

  async function refresh() {
    const result = await listProjectFiles(session.projectDir)
    if (!result.ok) return

    const interesting = result.files.filter(
      (f) =>
        f.name.endsWith('.md') ||
        f.name.endsWith('.txt') ||
        f.name.endsWith('.py') ||
        f.name.endsWith('.js') ||
        f.name.endsWith('.ts') ||
        f.name.endsWith('.json') ||
        f.name.endsWith('.csv')
    )

    setFiles(interesting)

    // Auto-select: only if the user hasn't explicitly picked a file yet,
    // AND the newest user-facing file has changed since last poll. This
    // lets the view "follow" Claude's latest output without overriding the
    // student's manual navigation.
    if (!userSelectedRef.current && interesting.length > 0) {
      const target = pickAutoFile(interesting)
      if (target && target.path !== lastAutoPath.current) {
        setSelectedPath(target.path)
        lastAutoPath.current = target.path
      }
    }
    setLoading(false)
  }

  async function loadContent(relPath: string) {
    const fullPath = `${session.projectDir}/${relPath}`.replace(/\//g, '\\')
    const result = await readProjectFile(fullPath)
    if (result.ok && result.content !== null) setContent(result.content)
  }

  // Poll for file changes
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.projectDir])

  // Reset selection bookkeeping when the session changes
  useEffect(() => {
    userSelectedRef.current = false
    lastAutoPath.current = null
    setSelectedPath(null)
  }, [session.projectDir])

  // Load the selected file's content + re-poll it while selected
  useEffect(() => {
    if (!selectedPath) {
      setContent('')
      return
    }
    loadContent(selectedPath)
    const timer = setInterval(() => loadContent(selectedPath), POLL_INTERVAL)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath])

  function handlePickFile(path: string) {
    userSelectedRef.current = true
    setSelectedPath(path)
  }

  const modeColors: Record<string, string> = {
    Think: 'text-blue-400',
    Draft: 'text-amber-400',
    Build: 'text-emerald-400',
    Study: 'text-purple-400',
    Resume: 'text-zinc-400',
  }

  const buckets = useMemo(() => categorize(files), [files])
  const phaseStates = useMemo(
    () => PHASES.map((p) => ({ ...p, done: p.matches(files) })),
    [files]
  )

  // Only show the meta toggle if there are meta files worth showing
  const hasMeta = buckets.meta.length > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
          <Eye size={16} className="text-plume-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-base font-bold text-zinc-100">{session.assignmentName}</h2>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className={`font-semibold ${modeColors[session.mode] ?? 'text-zinc-400'}`}>
              {session.mode}
            </span>
            <span>·</span>
            <Clock size={10} />
            <span>Started {new Date(session.startedAt).toLocaleTimeString()}</span>
          </div>
        </div>
        <button
          onClick={() => openProjectDir(session.projectDir)}
          title="Open project folder"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
        >
          <FolderOpen size={12} /> Open folder
        </button>
        <button
          onClick={refresh}
          title="Refresh files"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Progress timeline */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/8 bg-zinc-900/30 px-6 py-3">
        {phaseStates.map((phase, i) => (
          <React.Fragment key={phase.id}>
            {i > 0 && (
              <div className={`h-px w-4 flex-shrink-0 ${phase.done ? 'bg-plume-500/50' : 'bg-white/10'}`} />
            )}
            <PhasePill phase={phase} />
          </React.Fragment>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-plume-400" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* File tree sidebar — grouped by category */}
          <div className="flex w-60 flex-col border-r border-white/8 bg-zinc-900/30">
            <div className="flex items-center gap-1.5 border-b border-white/8 px-3 py-2">
              <FileText size={11} className="text-zinc-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Files ({files.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {files.length === 0 ? (
                <EmptyFileList />
              ) : (
                <>
                  {/* Visible categories (everything except meta) */}
                  {(['drafts', 'research', 'study', 'analysis', 'other'] as CategoryId[]).map((catId) => {
                    const cat = CATEGORIES.find((c) => c.id === catId)!
                    const bucket = buckets[catId]
                    if (bucket.length === 0) return null
                    return (
                      <FileGroup
                        key={catId}
                        label={cat.label}
                        Icon={cat.Icon}
                        color={cat.color}
                        files={bucket}
                        selectedPath={selectedPath}
                        onPick={handlePickFile}
                      />
                    )
                  })}

                  {/* Meta (collapsible) */}
                  {hasMeta && (
                    <div>
                      <button
                        onClick={() => setMetaOpen((o) => !o)}
                        className="flex w-full items-center gap-1.5 border-t border-white/5 bg-zinc-900/50 px-3 py-1.5 text-left transition-colors hover:bg-white/5"
                      >
                        <ChevronDown
                          size={10}
                          className="text-zinc-500 transition-transform"
                          style={{ transform: metaOpen ? 'rotate(0)' : 'rotate(-90deg)' }}
                        />
                        <Settings size={10} className="text-zinc-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          Meta ({buckets.meta.length})
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {metaOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            {buckets.meta.map((f) => (
                              <FileRow
                                key={f.path}
                                file={f}
                                selected={f.path === selectedPath}
                                onPick={handlePickFile}
                                dim
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Markdown preview */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {selectedPath ? (
              <>
                <div className="flex items-center gap-2 border-b border-white/8 bg-zinc-900/20 px-4 py-2">
                  <span className="truncate font-mono text-[11px] text-zinc-400">{selectedPath}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                  </div>
                </div>
              </>
            ) : (
              <WaitingForClaude />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PhasePill({ phase }: { phase: PhaseDef & { done: boolean } }) {
  const Icon = phase.Icon
  return (
    <div
      className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors ${
        phase.done
          ? 'border-plume-500/40 bg-plume-500/10 text-plume-300'
          : 'border-white/10 bg-white/[0.02] text-zinc-500'
      }`}
    >
      {phase.done ? (
        <Check size={10} className="text-plume-400" />
      ) : (
        <Circle size={9} className="text-zinc-600" />
      )}
      <Icon size={10} />
      <span>{phase.label}</span>
    </div>
  )
}

function FileGroup({
  label,
  Icon,
  color,
  files,
  selectedPath,
  onPick,
}: {
  label: string
  Icon: React.ElementType
  color: string
  files: ProjectFile[]
  selectedPath: string | null
  onPick: (path: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 border-t border-white/5 bg-zinc-900/50 px-3 py-1.5">
        <Icon size={10} className={color} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>
          {label}
        </span>
        <span className="ml-auto text-[9px] text-zinc-600">{files.length}</span>
      </div>
      {files.map((f) => (
        <FileRow
          key={f.path}
          file={f}
          selected={f.path === selectedPath}
          onPick={onPick}
        />
      ))}
    </div>
  )
}

function FileRow({
  file,
  selected,
  onPick,
  dim = false,
}: {
  file: ProjectFile
  selected: boolean
  onPick: (path: string) => void
  dim?: boolean
}) {
  const ageSec = Math.max(0, Math.floor((Date.now() - file.mtime) / 1000))
  const ageLabel =
    ageSec < 60 ? `${ageSec}s` :
    ageSec < 3600 ? `${Math.floor(ageSec / 60)}m` :
    `${Math.floor(ageSec / 3600)}h`

  return (
    <motion.button
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.12 }}
      onClick={() => onPick(file.path)}
      className={`flex w-full items-center gap-2 border-b border-white/5 px-3 py-1.5 text-left transition-colors ${
        selected
          ? 'bg-plume-500/10 text-plume-300'
          : dim
            ? 'text-zinc-500 hover:bg-white/5'
            : 'text-zinc-300 hover:bg-white/5 hover:text-zinc-100'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium">{file.name}</div>
        <div className="truncate text-[9px] text-zinc-600">{file.path}</div>
      </div>
      <span className="flex-shrink-0 text-[9px] text-zinc-600">{ageLabel}</span>
    </motion.button>
  )
}

function EmptyFileList() {
  return (
    <div className="px-3 py-6 text-center text-xs text-zinc-600">
      Waiting for Claude to create files...
    </div>
  )
}

function WaitingForClaude() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        className="flex h-10 w-10 items-center justify-center rounded-2xl bg-plume-500/10"
      >
        <Sparkles size={18} className="text-plume-400" />
      </motion.div>
      <p className="text-sm font-medium text-zinc-300">Claude is thinking</p>
      <p className="max-w-sm text-xs text-zinc-500">
        First drafts usually appear in 30–60 seconds. This view updates automatically.
      </p>
    </div>
  )
}
