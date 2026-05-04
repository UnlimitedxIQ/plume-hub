import React, { useEffect, useMemo, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText, FolderOpen, RefreshCw, Clock, Eye, Send, Loader2, Check,
  Settings, Sparkles, EyeOff,
} from 'lucide-react'
import { useStore, type ActiveSession } from '../lib/store'
import {
  listProjectFiles,
  readProjectFile,
  openProjectDir,
  appendProjectNote,
  type ProjectFile,
} from '../lib/bridge'
import { Hero, StatusPill } from '../components/ui'
import { inferPhases, type Phase } from './session/phases'

const POLL_INTERVAL = 3000

// ── Categorization ──────────────────────────────────────────────────────────
// Files are bucketed into categories based on their relative path. "Internals"
// files (CLAUDE.md, .plume/config, launch script, .started flag) get hidden
// behind a single toggle so the student doesn't need to see them.

type CategoryId = 'drafts' | 'research' | 'study' | 'analysis' | 'other' | 'internals'

interface CategoryDef {
  id: CategoryId
  label: string
  matches: (relPath: string) => boolean
}

const CATEGORIES: CategoryDef[] = [
  { id: 'drafts',    label: 'Drafts',    matches: (p) => p.startsWith('drafts/') || p.startsWith('drafts\\') },
  { id: 'research',  label: 'Research',  matches: (p) => p.startsWith('research/') || p.startsWith('research\\') },
  { id: 'study',     label: 'Study',     matches: (p) => p.startsWith('study/') || p.startsWith('study\\') },
  {
    id: 'analysis',  label: 'Analysis',
    matches: (p) => {
      const isPlume = p.startsWith('.plume/') || p.startsWith('.plume\\')
      if (!isPlume) return false
      return (
        p.includes('rubric_analysis') ||
        p.includes('canvas/assignment') || p.includes('canvas\\assignment') ||
        p.includes('canvas/rubric') || p.includes('canvas\\rubric') ||
        p.includes('research_brief') || p.includes('outline')
      )
    },
  },
  {
    id: 'internals', label: 'Internals',
    matches: (p) => {
      if (p === 'CLAUDE.md') return true
      if (p === '_notes.md') return false // student-authored, surface in Other
      if (p.startsWith('.plume/') || p.startsWith('.plume\\')) return true
      return false
    },
  },
  { id: 'other',     label: 'Other',     matches: () => true },
]

function categorize(files: ProjectFile[]): Record<CategoryId, ProjectFile[]> {
  const buckets: Record<CategoryId, ProjectFile[]> = {
    drafts: [], research: [], study: [], analysis: [], other: [], internals: [],
  }
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/')
    for (const cat of CATEGORIES) {
      if (cat.matches(path)) {
        buckets[cat.id].push(f)
        break
      }
    }
  }
  return buckets
}

function pickAutoFile(files: ProjectFile[]): ProjectFile | null {
  const buckets = categorize(files)
  const order: CategoryId[] = ['drafts', 'study', 'research', 'analysis', 'other']
  for (const cat of order) {
    if (buckets[cat].length > 0) return buckets[cat][0]
  }
  if (buckets.internals.length > 0) return buckets.internals[0]
  return null
}

// ── Component ───────────────────────────────────────────────────────────────

export function SessionPanel() {
  const session = useStore((s) => s.activeSession)

  if (!session) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <Hero>
          <h1 className="text-display text-white">Live</h1>
          <p className="text-sm text-white/80">When Claude is working, this is where it shows up.</p>
        </Hero>
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="card flex max-w-md items-center gap-3">
            <Eye size={20} className="flex-shrink-0 text-stone-500" />
            <div>
              <p className="text-sm font-semibold text-stone-200">No session yet</p>
              <p className="mt-0.5 text-xs text-stone-500">
                Pick a mode on a Canvas assignment to start. Build is the canonical move.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <ActiveSessionView session={session} />
}

function ActiveSessionView({ session }: { session: ActiveSession }) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showInternals, setShowInternals] = useState(false)
  const userSelectedRef = useRef(false)
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
        f.name.endsWith('.csv'),
    )

    setFiles(interesting)

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

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.projectDir])

  useEffect(() => {
    userSelectedRef.current = false
    lastAutoPath.current = null
    setSelectedPath(null)
  }, [session.projectDir])

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

  const buckets = useMemo(() => categorize(files), [files])
  const phases = useMemo(() => inferPhases(files), [files])
  const hasInternals = buckets.internals.length > 0
  const startedLabel = useMemo(() => {
    const elapsed = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000))
    if (elapsed < 60) return `${elapsed}s ago`
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`
    return `${Math.floor(elapsed / 3600)}h ago`
  }, [session.startedAt, files])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Hero>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-display truncate text-white">{session.assignmentName}</h1>
            <div className="mt-2 flex items-center gap-2 text-xs text-white/80">
              <ModeTag mode={session.mode} />
              <span className="text-white/40">·</span>
              <Clock size={11} className="text-white/60" />
              <span>Started {startedLabel}</span>
            </div>
          </div>
          <button
            onClick={() => openProjectDir(session.projectDir)}
            aria-label="Open project folder"
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-quick ease-quiet hover:bg-black/30"
          >
            <FolderOpen size={12} /> Open folder
          </button>
          <button
            onClick={refresh}
            aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-colors duration-quick ease-quiet hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Adaptive phase strip */}
        <div className="flex flex-wrap items-center gap-1.5">
          {phases.map((p) => <PhasePill key={p.id} phase={p} />)}
        </div>
      </Hero>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-plume-400" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <aside className="flex w-64 flex-col border-r border-subtle surface-1">
            <header className="flex items-center gap-1.5 border-b border-subtle px-3 py-2">
              <FileText size={11} className="text-stone-500" />
              <span className="section-label">Files</span>
              <span className="text-micro text-stone-500">{files.length}</span>
              <div className="flex-1" />
              <button
                onClick={() => setShowInternals((v) => !v)}
                aria-pressed={showInternals}
                title={showInternals ? 'Hide internals' : 'Show internals'}
                className="flex items-center gap-1 text-micro font-semibold text-stone-500 transition-colors duration-quick ease-quiet hover:text-stone-300"
              >
                {showInternals ? <EyeOff size={11} /> : <Eye size={11} />}
                Internals
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {files.length === 0 ? (
                <EmptyFileList />
              ) : (
                <>
                  {(['drafts', 'research', 'study', 'analysis', 'other'] as CategoryId[]).map((catId) => {
                    const cat = CATEGORIES.find((c) => c.id === catId)!
                    const bucket = buckets[catId]
                    if (bucket.length === 0) return null
                    return (
                      <FileGroup
                        key={catId}
                        label={cat.label}
                        files={bucket}
                        selectedPath={selectedPath}
                        onPick={handlePickFile}
                      />
                    )
                  })}
                  {hasInternals && showInternals && (
                    <FileGroup
                      label="Internals"
                      files={buckets.internals}
                      selectedPath={selectedPath}
                      onPick={handlePickFile}
                      dim
                    />
                  )}
                </>
              )}
            </div>
          </aside>

          <main className="flex flex-1 flex-col overflow-hidden">
            {selectedPath ? (
              <>
                <div className="flex items-center gap-2 border-b border-subtle surface-1 px-4 py-2">
                  <span className="truncate font-mono text-micro text-stone-400">{selectedPath}</span>
                  <div className="flex-1" />
                  <FreshnessPill mtime={files.find((f) => f.path === selectedPath)?.mtime} />
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6">
                  <div className="prose prose-invert prose-sm mx-auto max-w-3xl">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                  </div>
                </div>
              </>
            ) : (
              <WaitingForClaude />
            )}
            <NoteForClaude projectDir={session.projectDir} />
          </main>
        </div>
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ModeTag({ mode }: { mode: string }) {
  const tone =
    mode === 'Build'  ? 'pill-yellow' :
    mode === 'Think'  ? 'pill-plume' :
    mode === 'Draft'  ? 'pill-warn' :
    mode === 'Study'  ? 'pill-plume' :
    'pill-zinc'
  return <span className={`pill ${tone}`}>{mode}</span>
}

function PhasePill({ phase }: { phase: Phase }) {
  const baseClass =
    phase.done && phase.active
      ? 'border-plumeyellow-400/40 bg-plumeyellow-500/10 text-plumeyellow-300'
      : phase.done
        ? 'border-plume-500/40 bg-plume-500/10 text-plume-300'
        : 'border-white/10 bg-white/[0.02] text-stone-500'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-[2px] text-micro font-semibold transition-colors duration-quick ease-quiet ${baseClass}`}>
      {phase.done ? <Check size={9} /> : <span className="h-1.5 w-1.5 rounded-full bg-stone-600" />}
      {phase.label}
    </span>
  )
}

function FileGroup({
  label,
  files,
  selectedPath,
  onPick,
  dim = false,
}: {
  label: string
  files: ProjectFile[]
  selectedPath: string | null
  onPick: (path: string) => void
  dim?: boolean
}) {
  return (
    <section>
      <div className="surface-2 px-3 py-1.5">
        <span className="section-label">{label}</span>
        <span className="ml-2 text-micro text-stone-500">{files.length}</span>
      </div>
      {files.map((f) => (
        <FileRow
          key={f.path}
          file={f}
          selected={f.path === selectedPath}
          onPick={onPick}
          dim={dim}
        />
      ))}
    </section>
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
      className={`flex w-full items-center gap-2 border-b border-faint px-3 py-1.5 text-left transition-colors duration-quick ease-quiet ${
        selected
          ? 'bg-plume-700/30 text-white'
          : dim
            ? 'text-stone-500 hover:bg-white/5'
            : 'text-stone-300 hover:bg-white/5 hover:text-stone-100'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{file.name}</div>
        <div className="truncate text-micro text-stone-600">{file.path}</div>
      </div>
      <span className="inline-flex flex-shrink-0 items-center rounded-md border border-faint surface-2 px-1.5 py-0.5 font-mono text-micro text-stone-500">
        {ageLabel}
      </span>
    </motion.button>
  )
}

function FreshnessPill({ mtime }: { mtime: number | undefined }) {
  if (!mtime) return null
  const ageSec = Math.max(0, Math.floor((Date.now() - mtime) / 1000))
  if (ageSec < 8) {
    return <StatusPill tone="success">updated just now</StatusPill>
  }
  const label =
    ageSec < 60 ? `${ageSec}s ago` :
    ageSec < 3600 ? `${Math.floor(ageSec / 60)}m ago` :
    `${Math.floor(ageSec / 3600)}h ago`
  return <span className="text-micro text-stone-500">updated {label}</span>
}

function EmptyFileList() {
  return (
    <div className="px-3 py-6 text-center text-xs text-stone-500">
      Waiting for Claude to create files...
    </div>
  )
}

function WaitingForClaude() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-plume-700/30"
      >
        <Sparkles size={20} className="text-plumeyellow-400" />
      </motion.div>
      <p className="text-sm font-semibold text-stone-200">Claude is thinking</p>
      <p className="max-w-sm text-xs text-stone-500">
        First drafts usually appear in 30 to 60 seconds. This view updates automatically.
      </p>
    </div>
  )
}

function NoteForClaude({ projectDir }: { projectDir: string }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSend() {
    if (!note.trim() || busy) return
    setBusy(true)
    const res = await appendProjectNote({ projectDir, note: note.trim() })
    setBusy(false)
    if (res.ok) {
      setResult({ ok: true, msg: 'Saved to _notes.md' })
      setNote('')
      setTimeout(() => setResult(null), 3000)
    } else {
      setResult({ ok: false, msg: res.error ?? 'Save failed' })
    }
  }

  return (
    <div className="flex-shrink-0 border-t border-subtle surface-1 px-4 py-2.5">
      <div className="flex items-center gap-2 pb-1.5">
        <Settings size={11} className="text-stone-500" />
        <span className="section-label">Note for Claude</span>
        <span className="text-micro text-stone-500">
          appends to <code className="text-stone-400">_notes.md</code>, picked up on Resume
        </span>
        {result && (
          <span className={`ml-auto text-micro font-semibold ${result.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {result.msg}
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Make this paragraph more concise..."
          rows={2}
          className="flex-1 resize-none rounded-md border border-subtle bg-ink-800 px-3 py-2 text-xs leading-relaxed text-stone-200 placeholder-stone-500 outline-none focus:border-plume-500/60"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <button
          onClick={handleSend}
          disabled={!note.trim() || busy}
          className="btn-primary-inline flex-shrink-0 disabled:opacity-40"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Save
        </button>
      </div>
    </div>
  )
}
