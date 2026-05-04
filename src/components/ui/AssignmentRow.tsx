import React, { useState } from 'react'
import DOMPurify from 'dompurify'
import { ChevronDown, Loader2, Check, Hammer } from 'lucide-react'
import type { Assignment } from '../../lib/canvas-types'
import { formatPoints } from '../../lib/format'
import { useStore } from '../../lib/store'
import { startAssignment, openProjectDir } from '../../lib/bridge'
import { urgencyOf, type Urgency } from '../../panels/canvas/timeline'

type WorkflowMode = 'think' | 'draft' | 'build' | 'study'
export type LaunchMode = WorkflowMode | 'resume'

const MODE_LABELS: Record<LaunchMode, string> = {
  build: 'Build', think: 'Think', draft: 'Draft', study: 'Study', resume: 'Resume',
}

interface Props {
  assignment: Assignment
  courseCode: string
  /** When true, mode buttons are interactive. Set to false on read-only previews. */
  interactive?: boolean
  /** Optional extra microcopy after the course pill (e.g. exact due time). */
  dueLabel?: string
}

/**
 * Two-line assignment row:
 *
 *   ●  Title (text-base bold cream)             [Build] T  D  S  R  ▾
 *      COURSE  ·  Tonight 11pm (rose)  ·  25 pts
 *
 * Title is the protagonist. Build is amber. Think/Draft/Study/Resume are
 * single-letter chips so the whole action block stays compact. Expand the
 * details with the chevron on the right of line 1; the panel that slides
 * out is generous so reading the assignment description feels deliberate.
 *
 * Due time is colored by urgency: rose (overdue/tonight), amber (soon, next
 * 3 days), emerald (later, anything beyond).
 */
export function AssignmentRow({
  assignment,
  courseCode,
  interactive = true,
  dueLabel,
}: Props) {
  const { setActiveTab, setActiveSession } = useStore()
  const [descOpen, setDescOpen] = useState(false)
  const [startingMode, setStartingMode] = useState<LaunchMode | null>(null)
  const [launched, setLaunched] = useState<{ mode: LaunchMode; projectDir: string } | null>(null)

  const urgency = urgencyOf(assignment.dueAt)

  async function handleLaunch(mode: LaunchMode) {
    if (!interactive || startingMode) return
    setStartingMode(mode)
    try {
      const result = await startAssignment({
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        courseCode,
        assignmentName: assignment.name,
        htmlUrl: assignment.htmlUrl,
        dueAt: assignment.dueAt,
        mode,
      })
      if (result.ok && result.projectDir) {
        const projectDir = result.projectDir as string
        setLaunched({ mode, projectDir })
        setActiveSession({
          projectDir,
          assignmentName: assignment.name,
          mode: MODE_LABELS[mode],
          startedAt: Date.now(),
        })
        setActiveTab('session')
      }
    } finally {
      setStartingMode(null)
    }
  }

  const otherStarting = startingMode !== null
  const buildState = stateFor('build', startingMode, launched)
  const thinkState = stateFor('think', startingMode, launched)
  const draftState = stateFor('draft', startingMode, launched)
  const studyState = stateFor('study', startingMode, launched)
  const resumeState = stateFor('resume', startingMode, launched)

  return (
    <article className="border-b border-faint px-4 py-2.5 transition-colors duration-quick ease-quiet hover:bg-white/[0.02]">
      {/* Line 1: dot + title + action block + Details chevron */}
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotClass(urgency)}`} aria-hidden />
        <h3 className="flex-1 truncate text-base font-semibold text-cream">
          {assignment.name}
        </h3>
        <div className="flex flex-shrink-0 items-center gap-1">
          <BuildButton
            state={buildState}
            disabled={!interactive || (otherStarting && startingMode !== 'build')}
            onClick={() => handleLaunch('build')}
          />
          <LetterMode
            letter="T"
            label="Think"
            state={thinkState}
            disabled={!interactive || (otherStarting && startingMode !== 'think')}
            onClick={() => handleLaunch('think')}
          />
          <LetterMode
            letter="D"
            label="Draft"
            state={draftState}
            disabled={!interactive || (otherStarting && startingMode !== 'draft')}
            onClick={() => handleLaunch('draft')}
          />
          <LetterMode
            letter="S"
            label="Study"
            state={studyState}
            disabled={!interactive || (otherStarting && startingMode !== 'study')}
            onClick={() => handleLaunch('study')}
          />
          <LetterMode
            letter="R"
            label="Resume"
            state={resumeState}
            disabled={!interactive || (otherStarting && startingMode !== 'resume')}
            onClick={() => handleLaunch('resume')}
            tone="resume"
          />
          <button
            onClick={() => setDescOpen((v) => !v)}
            aria-expanded={descOpen}
            aria-label={descOpen ? 'Hide details' : 'Show details'}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-subtle text-cream-muted transition-colors duration-quick ease-quiet hover:bg-white/5 hover:text-cream ${
              descOpen ? 'bg-plume-700/40 text-cream' : ''
            }`}
          >
            <ChevronDown
              size={14}
              className="transition-transform duration-mid ease-quiet"
              style={{ transform: descOpen ? 'rotate(180deg)' : 'rotate(0)' }}
            />
          </button>
        </div>
      </div>

      {/* Line 2: course · urgency-colored due · points */}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[18px] text-micro">
        <span className="font-semibold text-plume-300">{courseCode}</span>
        {dueLabel && (
          <>
            <span className="text-cream-dim">·</span>
            <span className={`font-semibold ${urgencyTextClass(urgency)}`}>{dueLabel}</span>
          </>
        )}
        {assignment.pointsPossible != null && (
          <>
            <span className="text-cream-dim">·</span>
            <span className="text-cream-muted">{formatPoints(assignment.pointsPossible)}</span>
          </>
        )}
        {launched && (
          <>
            <span className="text-cream-dim">·</span>
            <button
              onClick={() => openProjectDir(launched.projectDir)}
              className="font-semibold text-plume-300 hover:text-cream"
            >
              Open folder
            </button>
          </>
        )}
      </div>

      {/* Expanded description: generous panel so the reveal feels real. */}
      <div className={descOpen ? 'row-expanded' : 'row-collapsed'}>
        <div>
          <div className="mt-3 rounded-lg surface-1 border border-faint px-5 py-4">
            {assignment.description ? (
              <div
                className="prose prose-invert max-w-none text-sm leading-relaxed text-cream-muted"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(assignment.description) }}
              />
            ) : (
              <p className="text-sm italic text-cream-dim">No description on this assignment.</p>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

// ── Urgency styling ────────────────────────────────────────────────────────

function dotClass(u: Urgency): string {
  switch (u) {
    case 'overdue': return 'bg-rose-500'
    case 'tonight': return 'bg-rose-400'
    case 'soon':    return 'bg-amber-400'
    case 'later':   return 'bg-emerald-400'
    case 'noDate':  return 'bg-stone-500'
  }
}

function urgencyTextClass(u: Urgency): string {
  switch (u) {
    case 'overdue': return 'text-rose-400'
    case 'tonight': return 'text-rose-300'
    case 'soon':    return 'text-amber-300'
    case 'later':   return 'text-emerald-300'
    case 'noDate':  return 'text-cream-muted'
  }
}

// ── Mode buttons ────────────────────────────────────────────────────────────

type ButtonState = 'idle' | 'starting' | 'launched'

function stateFor(
  mode: LaunchMode,
  startingMode: LaunchMode | null,
  launched: { mode: LaunchMode } | null,
): ButtonState {
  if (launched?.mode === mode) return 'launched'
  if (startingMode === mode) return 'starting'
  return 'idle'
}

function BuildButton({
  state,
  disabled,
  onClick,
}: {
  state: ButtonState
  disabled: boolean
  onClick: () => void
}) {
  let cls = 'bg-plumeyellow-500 text-ink-900 hover:bg-plumeyellow-400'
  if (state === 'launched') cls = 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
  else if (state === 'starting') cls = 'bg-plumeyellow-600 text-ink-900'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-bold tracking-wide transition-colors duration-quick ease-quiet outline-none focus-visible:ring-2 focus-visible:ring-plumeyellow-400/60 disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
      data-mode="build"
      title="Build: full submission"
    >
      {state === 'starting' ? (
        <Loader2 size={11} className="animate-spin" />
      ) : state === 'launched' ? (
        <Check size={11} />
      ) : (
        <Hammer size={11} />
      )}
      Build
    </button>
  )
}

function LetterMode({
  letter,
  label,
  state,
  disabled,
  onClick,
  tone,
}: {
  letter: string
  label: string
  state: ButtonState
  disabled: boolean
  onClick: () => void
  tone?: 'resume'
}) {
  // Single-letter chip. Resume gets a dimmer idle so it visually recedes
  // vs. Think/Draft/Study. Hover reveals the full name via title=.
  const idle = tone === 'resume'
    ? 'text-cream-dim hover:text-cream hover:bg-white/5'
    : 'text-cream-muted hover:text-cream hover:bg-white/5'
  let cls = idle
  if (state === 'launched') cls = 'bg-emerald-500/15 text-emerald-300'
  else if (state === 'starting') cls = 'bg-plumeyellow-500/15 text-plumeyellow-300'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold transition-colors duration-quick ease-quiet outline-none focus-visible:ring-2 focus-visible:ring-plumeyellow-400/40 disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
      data-mode={label.toLowerCase()}
      title={label}
      aria-label={label}
    >
      {state === 'starting' ? (
        <Loader2 size={11} className="animate-spin" />
      ) : state === 'launched' ? (
        <Check size={11} />
      ) : (
        <span className="leading-none">{letter}</span>
      )}
    </button>
  )
}
