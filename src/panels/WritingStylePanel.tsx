import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Feather,
  Plus,
  ArrowLeft,
  Trash2,
  X,
  Check,
  AlertCircle,
  Loader2,
  FileText,
  File as FileIcon,
} from 'lucide-react'
import {
  listStyleProfiles,
  getStyleProfile,
  analyzeStyle,
  deleteStyleProfile,
  setActiveStyleProfile,
  getSettings,
  onStyleAnalysisProgress,
  type StyleProfileMeta,
  type StyleSampleInput,
} from '../lib/bridge'
import { FileDropZone, type UploadedSample } from '../components/FileDropZone'

type View = 'list' | 'create' | 'detail'
type CreatePhase = 'form' | 'analyzing' | 'error'

// Each sample tracks whether it came from an uploaded file (so we can show
// the real filename) or from a pasted textarea (falls back to sample-N.txt).
interface SampleDraft {
  content: string
  filename: string | null  // null = pasted, not uploaded
}

const MIN_SAMPLES = 2
const MAX_SAMPLES = 5
const MIN_SAMPLE_CHARS = 100
const MAX_LOG_LINES = 8

function emptySample(): SampleDraft {
  return { content: '', filename: null }
}

interface DetailState {
  profile: StyleProfileMeta | null
  markdown: string | null
  loading: boolean
  error: string | null
}

export function WritingStylePanel() {
  const [view, setView] = useState<View>('list')
  const [profiles, setProfiles] = useState<StyleProfileMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // create-view state
  const [createName, setCreateName] = useState('')
  const [createSamples, setCreateSamples] = useState<SampleDraft[]>([
    emptySample(),
    emptySample(),
  ])
  const [createPhase, setCreatePhase] = useState<CreatePhase>('form')
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [createError, setCreateError] = useState<string | null>(null)

  // detail-view state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailState>({
    profile: null,
    markdown: null,
    loading: false,
    error: null,
  })

  // Subscribe to progress events. The bridge returns an unsubscribe function
  // that we call in cleanup so listeners don't pile up across remounts.
  useEffect(() => {
    const unsubscribe = onStyleAnalysisProgress((line) => {
      setProgressLines((prev) => {
        const next = [...prev, line]
        return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next
      })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    void refreshProfiles()
    void getSettings().then((s) => {
      setActiveId(s.activeWritingStyleId ?? null)
    })
  }, [])

  async function refreshProfiles() {
    setLoading(true)
    setListError(null)
    try {
      const result = await listStyleProfiles()
      if (!result.ok) {
        setListError(result.error ?? 'Failed to load profiles')
        setProfiles([])
      } else {
        setProfiles(result.profiles)
      }
      const s = await getSettings()
      setActiveId(s.activeWritingStyleId ?? null)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(id: string) {
    setDetail({ profile: null, markdown: null, loading: true, error: null })
    try {
      const result = await getStyleProfile(id)
      if (!result.ok) {
        setDetail({
          profile: null,
          markdown: null,
          loading: false,
          error: result.error ?? 'Failed to load profile',
        })
        return
      }
      setDetail({
        profile: result.profile,
        markdown: result.markdown,
        loading: false,
        error: null,
      })
    } catch (err) {
      setDetail({
        profile: null,
        markdown: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  function goToList() {
    setView('list')
    setSelectedId(null)
  }

  function goToCreate() {
    setCreateName('')
    setCreateSamples([emptySample(), emptySample()])
    setCreatePhase('form')
    setProgressLines([])
    setCreateError(null)
    setView('create')
  }

  async function goToDetail(id: string) {
    setSelectedId(id)
    setView('detail')
    await loadDetail(id)
  }

  async function handleSetActive(id: string) {
    const result = await setActiveStyleProfile(id)
    if (result.ok) {
      setActiveId(id)
      await refreshProfiles()
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteStyleProfile(id)
    if (result.ok) {
      if (activeId === id) setActiveId(null)
      if (selectedId === id) goToList()
      await refreshProfiles()
    }
  }

  function handleUpload(uploaded: UploadedSample[]) {
    if (uploaded.length === 0) return
    setCreateSamples((prev) => {
      // First, fill any empty pasted slots with uploaded files (no point having
      // empty textareas sitting around if we have real content to put in them).
      const next: SampleDraft[] = [...prev]
      const queue = [...uploaded]

      for (let i = 0; i < next.length && queue.length > 0; i++) {
        if (next[i].content.trim().length === 0 && next[i].filename === null) {
          const up = queue.shift()!
          next[i] = { filename: up.filename, content: up.content }
        }
      }

      // Append anything left over, capped by MAX_SAMPLES
      for (const up of queue) {
        if (next.length >= MAX_SAMPLES) break
        next.push({ filename: up.filename, content: up.content })
      }

      return next
    })
  }

  async function handleAnalyze() {
    const trimmedName = createName.trim()
    if (!trimmedName) return
    const nonEmpty = createSamples
      .map((sample, idx) => ({
        filename: sample.filename ?? kebabFilename(idx),
        content: sample.content,
      }))
      .filter((s) => s.content.trim().length >= MIN_SAMPLE_CHARS)
    if (nonEmpty.length < MIN_SAMPLES) return

    setCreatePhase('analyzing')
    setProgressLines([])
    setCreateError(null)

    try {
      const samples: StyleSampleInput[] = nonEmpty
      const result = await analyzeStyle({ name: trimmedName, samples })
      if (!result.ok || !result.profileId) {
        setCreateError(result.error ?? 'Analysis failed')
        setCreatePhase('error')
        return
      }
      await setActiveStyleProfile(result.profileId)
      setActiveId(result.profileId)
      await refreshProfiles()
      setSelectedId(result.profileId)
      setView('detail')
      await loadDetail(result.profileId)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error')
      setCreatePhase('error')
    }
  }

  // ── Subtitle / header ──
  const subtitle =
    view === 'list'
      ? 'Teach Plume to write in your voice.'
      : view === 'create'
      ? 'Paste 2–5 of your past papers.'
      : detail.profile
      ? `${detail.profile.sampleCount} samples · analyzed ${
          detail.profile.analyzedAt ? relativeTime(detail.profile.analyzedAt) : 'never'
        }`
      : 'Loading profile…'

  const title = view === 'detail' && detail.profile ? detail.profile.name : 'Writing Style'

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
          <Feather size={16} className="text-plume-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-base font-bold text-zinc-100">{title}</h2>
          <p className="truncate text-xs text-zinc-500">{subtitle}</p>
        </div>

        {view === 'list' && (
          <button
            onClick={goToCreate}
            className="flex items-center gap-1.5 rounded-lg border border-plume-500/40 bg-plume-500/15 px-3 py-1.5 text-xs font-semibold text-plume-300 transition-colors hover:bg-plume-500/25"
          >
            <Plus size={12} /> New profile
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.12 }}
              className="flex flex-1 flex-col overflow-y-auto p-6"
            >
              <ListView
                loading={loading}
                error={listError}
                profiles={profiles}
                activeId={activeId}
                onCreate={goToCreate}
                onOpen={goToDetail}
                onSetActive={handleSetActive}
                onDelete={handleDelete}
              />
            </motion.div>
          )}

          {view === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.12 }}
              className="flex flex-1 flex-col overflow-y-auto p-6"
            >
              <BackBar onBack={goToList} />
              {createPhase === 'form' && (
                <CreateForm
                  name={createName}
                  samples={createSamples}
                  onNameChange={setCreateName}
                  onSampleChange={(idx, content) =>
                    setCreateSamples((prev) =>
                      prev.map((s, i) =>
                        i === idx
                          ? {
                              ...s,
                              content,
                              // Typing into a slot clears its uploaded filename — it's
                              // now hand-edited and should be treated as a paste.
                              filename: null,
                            }
                          : s
                      )
                    )
                  }
                  onAddSample={() =>
                    setCreateSamples((prev) =>
                      prev.length < MAX_SAMPLES ? [...prev, emptySample()] : prev
                    )
                  }
                  onRemoveSample={(idx) =>
                    setCreateSamples((prev) =>
                      prev.length > MIN_SAMPLES ? prev.filter((_, i) => i !== idx) : prev
                    )
                  }
                  onUpload={handleUpload}
                  onAnalyze={handleAnalyze}
                />
              )}
              {createPhase === 'analyzing' && <AnalyzingState lines={progressLines} />}
              {createPhase === 'error' && (
                <ErrorState
                  message={createError ?? 'Something went wrong.'}
                  onRetry={() => {
                    setCreateError(null)
                    setCreatePhase('form')
                  }}
                />
              )}
            </motion.div>
          )}

          {view === 'detail' && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.12 }}
              className="flex flex-1 flex-col overflow-hidden p-6"
            >
              <BackBar onBack={goToList} />
              <DetailView
                state={detail}
                isActive={selectedId !== null && activeId === selectedId}
                onSetActive={() => selectedId && handleSetActive(selectedId)}
                onDelete={() => selectedId && handleDelete(selectedId)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Back bar ─────────────────────────────────────────────────────────────────

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
      >
        <ArrowLeft size={12} /> Back
      </button>
    </div>
  )
}

// ── List view ────────────────────────────────────────────────────────────────

function ListView({
  loading,
  error,
  profiles,
  activeId,
  onCreate,
  onOpen,
  onSetActive,
  onDelete,
}: {
  loading: boolean
  error: string | null
  profiles: StyleProfileMeta[]
  activeId: string | null
  onCreate: () => void
  onOpen: (id: string) => void
  onSetActive: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-plume-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle size={12} /> {error}
        </div>
      </div>
    )
  }

  if (profiles.length === 0) {
    return <EmptyState onCreate={onCreate} />
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {profiles.map((profile, i) => (
        <ProfileCard
          key={profile.id}
          profile={profile}
          index={i}
          isActive={profile.id === activeId}
          onOpen={() => onOpen(profile.id)}
          onSetActive={() => onSetActive(profile.id)}
          onDelete={() => onDelete(profile.id)}
        />
      ))}
      <button
        onClick={onCreate}
        className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-3 text-xs font-semibold text-zinc-400 transition-colors hover:border-plume-500/40 hover:bg-plume-500/5 hover:text-plume-300"
      >
        <Plus size={12} /> New profile
      </button>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-plume-500/15">
        <Feather size={24} className="text-plume-400" />
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">No writing styles yet</div>
        <div className="mt-1 text-xs text-zinc-500">
          Create one and Plume will draft assignments in your voice.
        </div>
      </div>
      <button
        onClick={onCreate}
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-plume-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-plume-600"
      >
        <Plus size={12} /> Create your first profile
      </button>
    </motion.div>
  )
}

function ProfileCard({
  profile,
  index,
  isActive,
  onOpen,
  onSetActive,
  onDelete,
}: {
  profile: StyleProfileMeta
  index: number
  isActive: boolean
  onOpen: () => void
  onSetActive: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const analyzedLabel = profile.analyzedAt
    ? `analyzed ${relativeTime(profile.analyzedAt)}`
    : '(not analyzed)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onOpen}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
        isActive
          ? 'border-plume-500/40 bg-plume-500/5 hover:bg-plume-500/10'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
      }`}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-plume-500/15">
        <Feather size={14} className="text-plume-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-zinc-100">{profile.name}</div>
        <div className="truncate text-xs text-zinc-500">
          {profile.sampleCount} samples · {analyzedLabel}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          if (!isActive) onSetActive()
        }}
        title={isActive ? 'Active' : 'Set active'}
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
          isActive
            ? 'border-plume-500/50 bg-plume-500/20 text-plume-300'
            : 'border-white/10 bg-white/5 text-zinc-500 hover:border-plume-500/30 hover:text-plume-300'
        }`}
      >
        <span
          className={`inline-flex h-2 w-2 items-center justify-center rounded-full ${
            isActive ? 'bg-plume-400' : 'bg-zinc-700'
          }`}
        />
        {isActive ? 'Active' : 'Inactive'}
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation()
          if (confirmDelete) {
            onDelete()
            setConfirmDelete(false)
          } else {
            setConfirmDelete(true)
          }
        }}
        onMouseLeave={() => setConfirmDelete(false)}
        title={confirmDelete ? 'Click again to confirm' : 'Delete profile'}
        className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
          confirmDelete
            ? 'border-red-500/50 bg-red-500/15 text-red-300'
            : 'border-white/10 text-zinc-500 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400'
        }`}
      >
        <Trash2 size={11} />
        {confirmDelete && <span>Confirm?</span>}
      </button>
    </motion.div>
  )
}

// ── Create view ──────────────────────────────────────────────────────────────

function CreateForm({
  name,
  samples,
  onNameChange,
  onSampleChange,
  onAddSample,
  onRemoveSample,
  onUpload,
  onAnalyze,
}: {
  name: string
  samples: SampleDraft[]
  onNameChange: (next: string) => void
  onSampleChange: (idx: number, content: string) => void
  onAddSample: () => void
  onRemoveSample: (idx: number) => void
  onUpload: (samples: UploadedSample[]) => void
  onAnalyze: () => void
}) {
  const nameOk = name.trim().length > 0
  const validSamples = samples.filter(
    (s) => s.content.trim().length >= MIN_SAMPLE_CHARS
  ).length
  const canSubmit = nameOk && validSamples >= MIN_SAMPLES
  const canAddMore = samples.length < MAX_SAMPLES
  const remainingSlots = MAX_SAMPLES - samples.filter((s) => s.content.trim().length > 0).length

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Profile name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Academic Essays"
          className="input-field"
        />
      </div>

      {/* File drop zone */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Upload documents
        </label>
        <FileDropZone
          onFiles={onUpload}
          maxFiles={Math.max(1, remainingSlots)}
          disabled={remainingSlots <= 0}
        />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          or paste text
        </span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {/* Samples */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Writing samples ({validSamples}/{samples.length} ready)
        </label>
        {samples.map((sample, idx) => {
          const isOptional = idx >= MIN_SAMPLES
          const valid = sample.content.trim().length >= MIN_SAMPLE_CHARS
          const isUpload = sample.filename !== null
          return (
            <div
              key={idx}
              className={`flex flex-col gap-1.5 rounded-xl border p-3 ${
                isUpload
                  ? 'border-plume-500/30 bg-plume-500/5'
                  : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-[1px] font-mono text-[10px] ${
                    isUpload
                      ? 'border-plume-500/30 bg-plume-500/10 text-plume-300'
                      : 'border-white/10 bg-zinc-900/60 text-zinc-400'
                  }`}
                  title={isUpload ? 'Uploaded file' : 'Pasted text'}
                >
                  {isUpload ? (
                    sample.filename?.toLowerCase().endsWith('.docx') ? (
                      <FileIcon size={9} />
                    ) : (
                      <FileText size={9} />
                    )
                  ) : null}
                  {sample.filename ?? kebabFilename(idx)}
                </span>
                <span
                  className={`text-[10px] ${
                    valid ? 'text-plume-400' : 'text-zinc-600'
                  }`}
                >
                  {sample.content.trim().length} chars
                  {!valid && sample.content.length > 0 && ` · need ${MIN_SAMPLE_CHARS}`}
                </span>
                {isOptional && (
                  <button
                    onClick={() => onRemoveSample(idx)}
                    title="Remove sample"
                    className="ml-auto flex h-6 w-6 items-center justify-center rounded-md border border-white/10 text-zinc-500 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              <textarea
                value={sample.content}
                onChange={(e) => onSampleChange(idx, e.target.value)}
                placeholder={
                  isUpload
                    ? 'Uploaded content — edit here to tweak it'
                    : 'Paste a complete piece you wrote here…'
                }
                rows={isUpload ? 4 : 6}
                className="w-full resize-y rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-plume-500/60 focus:ring-1 focus:ring-plume-500/30"
              />
            </div>
          )
        })}

        {canAddMore && (
          <button
            onClick={onAddSample}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-2 text-xs font-semibold text-zinc-400 transition-colors hover:border-plume-500/40 hover:bg-plume-500/5 hover:text-plume-300"
          >
            <Plus size={12} /> Add another sample
          </button>
        )}
      </div>

      {/* Submit */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onAnalyze}
          disabled={!canSubmit}
          className="btn-primary"
        >
          <Feather size={14} /> Analyze with Claude
        </button>
        <p className="text-center text-[10px] leading-relaxed text-zinc-500">
          Claude reads each sample, finds patterns across them, and writes a profile to
          ~/.claude/agents/. Takes about a minute.
        </p>
      </div>
    </div>
  )
}

function AnalyzingState({ lines }: { lines: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border border-plume-500/30 bg-plume-500/5 p-8"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-plume-500/20"
      >
        <Feather size={22} className="text-plume-400" />
      </motion.div>
      <div className="text-center">
        <div className="text-sm font-semibold text-zinc-100">
          Claude is learning your writing style
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          This normally takes about a minute.
        </div>
      </div>
      <div className="flex max-h-40 w-full flex-col gap-1 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/60 p-3 font-mono text-[10px] text-plume-400">
        {lines.length === 0 ? (
          <span className="text-zinc-600">Starting analyzer…</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="truncate">
              {line || '\u00A0'}
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
        <AlertCircle size={22} className="text-red-400" />
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">Analysis failed</div>
        <div className="mt-1 text-xs text-zinc-400">{message}</div>
      </div>
      <button
        onClick={onRetry}
        className="mt-2 rounded-lg border border-plume-500/40 bg-plume-500/15 px-3 py-1.5 text-xs font-semibold text-plume-300 transition-colors hover:bg-plume-500/25"
      >
        Try again
      </button>
    </div>
  )
}

// ── Detail view ──────────────────────────────────────────────────────────────

function DetailView({
  state,
  isActive,
  onSetActive,
  onDelete,
}: {
  state: DetailState
  isActive: boolean
  onSetActive: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (state.loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-plume-400" />
      </div>
    )
  }

  if (state.error || !state.profile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle size={12} /> {state.error ?? 'Profile not found.'}
        </div>
      </div>
    )
  }

  const { profile, markdown } = state
  const analyzedLabel = profile.analyzedAt
    ? relativeTime(profile.analyzedAt)
    : 'never'

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-1 flex-col overflow-hidden">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-plume-500/15">
          <Feather size={18} className="text-plume-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-zinc-100">{profile.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatChip label={`${profile.sampleCount} samples`} />
            <StatChip label={`Analyzed ${analyzedLabel}`} />
            {isActive ? (
              <span className="flex items-center gap-1 rounded-md border border-plume-500/40 bg-plume-500/15 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wider text-plume-300">
                <Check size={9} /> Active
              </span>
            ) : (
              <button
                onClick={onSetActive}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-plume-500/30 hover:text-plume-300"
              >
                Use this style
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60">
        <div className="h-full overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-300">
            {markdown ?? '(empty profile)'}
          </pre>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => {
            if (confirmDelete) {
              onDelete()
              setConfirmDelete(false)
            } else {
              setConfirmDelete(true)
            }
          }}
          onMouseLeave={() => setConfirmDelete(false)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            confirmDelete
              ? 'border-red-500/50 bg-red-500/15 text-red-300'
              : 'border-red-500/20 text-red-400 hover:border-red-500/40 hover:bg-red-500/10'
          }`}
        >
          <Trash2 size={12} />
          {confirmDelete ? 'Click again to confirm' : 'Delete profile'}
        </button>
      </div>
    </div>
  )
}

function StatChip({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-[2px] text-[10px] font-semibold text-zinc-400">
      {label}
    </span>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function kebabFilename(index: number): string {
  return `sample-${index + 1}.txt`
}

function relativeTime(ms: number): string {
  const now = Date.now()
  const diff = Math.max(0, now - ms)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  if (diff < minute) return 'just now'
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < 2 * day) return 'yesterday'
  if (diff < week) return `${Math.floor(diff / day)}d ago`
  if (diff < 4 * week) return `${Math.floor(diff / week)}w ago`
  const months = Math.floor(diff / (30 * day))
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(diff / (365 * day))
  return `${years}y ago`
}
