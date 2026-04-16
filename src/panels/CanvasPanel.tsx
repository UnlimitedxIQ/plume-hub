import React, { useEffect, useState, useCallback, useRef } from 'react'
import DOMPurify from 'dompurify'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Calendar, Megaphone, ChevronDown,
  AlertCircle, Lock, RefreshCw, Send, Loader2, Check,
  Brain, PenLine, Hammer, BookOpen, RotateCcw,
} from 'lucide-react'
import {
  listUpcoming,
  listCourses,
  listAnnouncements,
  listInstructors,
  sendCanvasMessage,
  onCanvasRefresh,
  getSettings,
  startAssignment,
  openProjectDir,
} from '../lib/bridge'
import type { Assignment } from '../lib/canvas-types'
import { formatPoints } from '../lib/format'
import { CanvasBadge } from '../components/canvas/CanvasBadge'
import { useStore } from '../lib/store'

type WorkflowMode = 'think' | 'draft' | 'build' | 'study'
// Launcher accepts workflow modes + a 'resume' action that continues the
// existing Claude conversation without injecting a new prompt.
type LaunchMode = WorkflowMode | 'resume'

interface ModeButtonDef {
  id: WorkflowMode
  label: string
  Icon: React.ElementType
  hint: string
}

const MODE_BUTTONS: ModeButtonDef[] = [
  { id: 'think', label: 'Think', Icon: Brain,    hint: 'Research all facts, angles & sources' },
  { id: 'draft', label: 'Draft', Icon: PenLine,  hint: 'Template with sections & bullet guides' },
  { id: 'build', label: 'Build', Icon: Hammer,   hint: 'Full submission — 3 passes, full marks' },
  { id: 'study', label: 'Study', Icon: BookOpen, hint: 'Practice exam, flashcards & slides' },
]

interface Course {
  id: number
  name: string
  courseCode: string
}

interface Announcement {
  id: number
  courseId: number
  title: string
  message: string
  postedAt: string | null
  authorName: string
}

// Per-course accent colors — UO palette (green/yellow primary, with complementary accents)
const COURSE_ACCENTS = [
  '#006747', // UO green
  '#FEE123', // UO yellow
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f97316', // orange
  '#14b8a6', // teal
  '#ec4899', // pink
  '#ef4444', // red
]
function getCourseAccent(index: number): string {
  return COURSE_ACCENTS[index % COURSE_ACCENTS.length]
}

// ─────────────────────────────────────────────────────────────────────────────

export function CanvasPanel() {
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasToken, setHasToken] = useState(true)

  // Vertical split — percentage for top row (assignments)
  const [topPercent, setTopPercent] = useState(65)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleRowDragStart = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const pct = Math.round((y / rect.height) * 100)
      setTopPercent(Math.max(20, Math.min(85, pct)))
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const settings = await getSettings()
      if (!settings.canvasToken) {
        setHasToken(false)
        setLoading(false)
        return
      }
      setHasToken(true)

      const [coursesResult, upcomingResult, announcementsResult] = await Promise.all([
        listCourses(),
        listUpcoming(),
        listAnnouncements(),
      ])

      if (coursesResult.ok && coursesResult.courses) {
        setCourses(coursesResult.courses as Course[])
      }
      if (upcomingResult.ok) {
        setAssignments((upcomingResult.assignments ?? []) as Assignment[])
      } else {
        setError(upcomingResult.error ?? 'Failed to load assignments')
      }
      if (announcementsResult.ok) {
        setAnnouncements((announcementsResult.announcements ?? []) as Announcement[])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    onCanvasRefresh(fetch)
  }, [fetch])

  // Empty states
  if (!hasToken) {
    return (
      <EmptyState
        icon={<Lock size={32} className="text-zinc-600" />}
        title="Canvas not connected"
        subtitle="Add your Canvas API token in Settings to see your assignments."
      />
    )
  }
  if (loading && courses.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-plume-400" />
          <p className="text-xs text-zinc-500">Loading Canvas data…</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle size={32} className="text-red-400" />}
        title="Failed to load"
        subtitle={error}
        action={
          <button
            onClick={fetch}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            <RefreshCw size={12} /> Retry
          </button>
        }
      />
    )
  }
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap size={32} className="text-zinc-600" />}
        title="No courses found"
        subtitle="Check your Canvas account and tracked course IDs in Settings."
      />
    )
  }

  // Sort courses by course code
  const sortedCourses = [...courses].sort((a, b) => a.courseCode.localeCompare(b.courseCode))

  function getAssignmentsForCourse(courseId: number): Assignment[] {
    return assignments
      // Hide assignments the student already submitted. Canvas's bucket=upcoming
      // still includes them until they're past-due or graded; we want them gone
      // as soon as the student turns them in.
      .filter((a) => a.courseId === courseId && !a.submitted)
      .sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return 0
        if (!a.dueAt) return 1
        if (!b.dueAt) return -1
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      })
  }

  function getAnnouncementsForCourse(courseId: number): Announcement[] {
    return announcements
      .filter((a) => a.courseId === courseId)
      .sort((a, b) => {
        if (!a.postedAt) return 1
        if (!b.postedAt) return -1
        return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
      })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-plume-500/15">
          <GraduationCap size={16} className="text-plume-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-zinc-100">Canvas Dashboard</h2>
          <p className="text-xs text-zinc-500">
            {courses.length} course{courses.length !== 1 ? 's' : ''} · {assignments.length} assignments · {announcements.length} announcements
          </p>
        </div>
        <button
          onClick={fetch}
          disabled={loading}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Two-row layout with draggable split */}
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden p-3">
        {/* Top row: one column per course, showing assignments */}
        <div
          style={{
            height: `${topPercent}%`,
            display: 'grid',
            gridTemplateColumns: `repeat(${sortedCourses.length}, 1fr)`,
            gap: '10px',
            minHeight: 0,
          }}
        >
          {sortedCourses.map((course, i) => (
            <CourseAssignmentColumn
              key={`assign-${course.id}`}
              course={course}
              accent={getCourseAccent(i)}
              assignments={getAssignmentsForCourse(course.id)}
              index={i}
            />
          ))}
        </div>

        {/* Draggable horizontal split */}
        <HorizontalSplitHandle onMouseDown={handleRowDragStart} />

        {/* Bottom row: one column per course, showing announcements */}
        <div
          style={{
            height: `${100 - topPercent}%`,
            display: 'grid',
            gridTemplateColumns: `repeat(${sortedCourses.length}, 1fr)`,
            gap: '10px',
            minHeight: 0,
          }}
        >
          {sortedCourses.map((course, i) => (
            <CourseAnnouncementColumn
              key={`announce-${course.id}`}
              course={course}
              accent={getCourseAccent(i)}
              announcements={getAnnouncementsForCourse(course.id)}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* Message composer — fixed at bottom */}
      <div className="flex-shrink-0 px-3 pb-3">
        <MessageComposer courses={sortedCourses} />
      </div>
    </div>
  )
}

// ── Message Composer ─────────────────────────────────────────────────────────

function MessageComposer({ courses }: { courses: Course[] }) {
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSend() {
    if (!body.trim() || selectedCourseId === '') return
    setSending(true)
    setResult(null)

    try {
      const course = courses.find((c) => c.id === selectedCourseId)
      const subject = course ? `Question about ${course.courseCode}` : 'Canvas Message'

      // Fetch instructor IDs for the selected course
      const instructorsResult = await listInstructors(selectedCourseId as number)
      if (!instructorsResult.ok || !instructorsResult.instructors) {
        setResult({ ok: false, msg: 'Could not load instructors' })
        setSending(false)
        return
      }

      const instructors = instructorsResult.instructors as { id: number; name: string }[]
      if (instructors.length === 0) {
        setResult({ ok: false, msg: 'No instructor found for this course' })
        setSending(false)
        return
      }

      const recipientIds = instructors.map((i) => String(i.id))
      const sendResult = await sendCanvasMessage({ recipientIds, subject, body: body.trim() })

      if (sendResult.ok) {
        setResult({ ok: true, msg: 'Sent!' })
        setBody('')
        setSelectedCourseId('')
        setTimeout(() => setResult(null), 3000)
      } else {
        setResult({ ok: false, msg: sendResult.error ?? 'Failed' })
      }
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const canSend = !sending && body.trim().length > 0 && selectedCourseId !== ''

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60 backdrop-blur-sm">
      {/* Label header */}
      <div className="flex items-center gap-1.5 border-b border-white/8 px-3 py-2">
        <Send size={10} className="text-plume-400" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Message your instructor
        </span>
      </div>

      {/* Body row */}
      <div className="flex items-stretch border-b border-white/5">
        {/* Course selector */}
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value === '' ? '' : Number(e.target.value))}
          className={`flex-shrink-0 border-r border-white/8 bg-transparent px-3 py-2 text-[11px] font-semibold outline-none cursor-pointer ${
            selectedCourseId === '' ? 'text-zinc-500' : 'text-zinc-200'
          }`}
          style={{ appearance: 'none', width: 150 }}
        >
          <option value="" className="bg-zinc-900">Select course…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
              {c.courseCode}
            </option>
          ))}
        </select>

        {/* Textarea */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your question to the instructor…"
          rows={3}
          className="flex-1 resize-none bg-transparent px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              handleSend()
            }
          }}
        />

        {/* Send button column */}
        <div className="flex flex-shrink-0 items-center gap-2 px-3">
          {result && (
            <span className={`text-[10px] font-semibold ${result.ok ? 'text-plume-400' : 'text-red-400'}`}>
              {result.msg}
            </span>
          )}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
              canSend
                ? 'bg-plume-yellow text-plume-700 hover:brightness-110'
                : 'cursor-not-allowed border border-white/8 text-zinc-600'
            }`}
          >
            <Send size={10} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {/* Hint row */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[9px] text-zinc-600">
        <span>Sends via Canvas Inbox to all teachers / TAs in the course</span>
        <span>Ctrl+Enter to send</span>
      </div>
    </div>
  )
}

// ── Assignment Column ────────────────────────────────────────────────────────

function CourseAssignmentColumn({
  course,
  accent,
  assignments,
  index,
}: {
  course: Course
  accent: string
  assignments: Assignment[]
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 backdrop-blur-sm"
    >
      {/* Course header with accent left border */}
      <div
        className="flex-shrink-0 border-b border-white/8 px-3 py-2.5"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <div className="text-[13px] font-bold" style={{ color: accent }}>
          {course.courseCode}
        </div>
        <div className="truncate text-[10px] text-zinc-500">{course.name}</div>
      </div>

      {/* Section label */}
      <div className="flex flex-shrink-0 items-center gap-1.5 px-3 pt-2 pb-1">
        <Calendar size={9} className="text-zinc-500" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Assignments
        </span>
        {assignments.length > 0 && (
          <span
            className="ml-auto rounded-full px-1.5 py-[0.5px] text-[9px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {assignments.length}
          </span>
        )}
      </div>

      {/* Scrollable assignment list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {assignments.length === 0 ? (
          <div className="px-3 py-4 text-[10px] italic text-zinc-600">No assignments</div>
        ) : (
          assignments.map((a, i) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              courseCode={course.courseCode}
              isLast={i === assignments.length - 1}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}

// ── Announcement Column ───────────────────────────────────────────────────────

function CourseAnnouncementColumn({
  course,
  accent,
  announcements,
  index,
}: {
  course: Course
  accent: string
  announcements: Announcement[]
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 + 0.1 }}
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 backdrop-blur-sm"
    >
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center gap-1.5 border-b border-white/8 px-3 py-2"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <Megaphone size={9} className="text-zinc-500" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Announcements
        </span>
        {announcements.length > 0 && (
          <span
            className="rounded-full px-1.5 py-[0.5px] text-[9px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {announcements.length}
          </span>
        )}
        <span className="ml-auto text-[9px]" style={{ color: `${accent}80` }}>
          {course.courseCode}
        </span>
      </div>

      {/* Scrollable announcements */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {announcements.length === 0 ? (
          <div className="px-3 py-4 text-[10px] italic text-zinc-600">No announcements</div>
        ) : (
          announcements.map((a, i) => (
            <AnnouncementRow
              key={a.id}
              announcement={a}
              isLast={i === announcements.length - 1}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}

// ── Assignment Row ────────────────────────────────────────────────────────────

function AssignmentRow({
  assignment,
  courseCode,
  isLast,
}: {
  assignment: Assignment
  courseCode: string
  isLast: boolean
}) {
  const { setActiveTab, setActiveSession } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [startingMode, setStartingMode] = useState<LaunchMode | null>(null)
  const [launched, setLaunched] = useState<{ mode: LaunchMode; projectDir: string } | null>(null)

  const now = Date.now()
  const due = assignment.dueAt ? new Date(assignment.dueAt).getTime() : null
  const isOverdue = due !== null && due < now
  const isSoon = due !== null && due - now < 3 * 86400000
  const dotColor = isOverdue ? '#ef4444' : isSoon ? '#f59e0b' : '#22c55e'

  const MODE_LABELS: Record<LaunchMode, string> = {
    think: 'Think', draft: 'Draft', build: 'Build', study: 'Study', resume: 'Resume',
  }

  async function handleLaunch(mode: LaunchMode) {
    if (startingMode) return
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

  return (
    <div className={isLast ? '' : 'border-b border-white/5'}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span
          className="mt-1.5 h-[5px] w-[5px] flex-shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="mb-1 truncate text-[11px] font-semibold text-zinc-100">
            {assignment.name}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <CanvasBadge dueAt={assignment.dueAt} />
            {assignment.pointsPossible != null && (
              <span className="text-[9px] text-zinc-500">{formatPoints(assignment.pointsPossible)}</span>
            )}
          </div>
        </div>
        <ChevronDown
          size={11}
          className="mt-1 flex-shrink-0 text-zinc-600 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
        />
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
            <div className="px-3 pb-3 pl-6">
              {/* Mode buttons — student picks which workflow to invoke.
                  Resume is adjacent, visually outlined (not filled) to read as
                  an "action" rather than a fifth workflow mode. */}
              <div className="mb-3 flex items-center gap-1.5">
                {MODE_BUTTONS.map(({ id, label, Icon, hint }) => {
                  const isStarting = startingMode === id
                  const isLaunched = launched?.mode === id
                  const disabled = startingMode !== null && !isStarting
                  return (
                    <button
                      key={id}
                      onClick={(e) => { e.stopPropagation(); handleLaunch(id) }}
                      disabled={disabled}
                      title={hint}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                        isLaunched
                          ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : isStarting
                            ? 'border border-plume-500/60 bg-plume-500/20 text-plume-200'
                            : disabled
                              ? 'border border-white/8 bg-white/[0.02] text-zinc-600'
                              : 'border border-plume-500/40 bg-plume-500/10 text-plume-300 hover:border-plume-500/70 hover:bg-plume-500/20'
                      }`}
                    >
                      {isStarting ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : isLaunched ? (
                        <Check size={10} />
                      ) : (
                        <Icon size={10} />
                      )}
                      {label}
                    </button>
                  )
                })}

                {/* Resume button — quiet continue, no prompt injection */}
                {(() => {
                  const isStarting = startingMode === 'resume'
                  const isLaunched = launched?.mode === 'resume'
                  const disabled = startingMode !== null && !isStarting
                  return (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLaunch('resume') }}
                      disabled={disabled}
                      title="Resume the previous Claude session (no prompt)"
                      className={`ml-1 flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors ${
                        isLaunched
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : isStarting
                            ? 'border-plume-500/60 bg-plume-500/10 text-plume-200'
                            : disabled
                              ? 'border-white/8 text-zinc-600'
                              : 'border-white/15 text-zinc-300 hover:border-plume-500/50 hover:text-plume-300'
                      }`}
                    >
                      {isStarting ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <RotateCcw size={10} />
                      )}
                      Resume
                    </button>
                  )
                })()}

                {launched && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openProjectDir(launched.projectDir) }}
                    className="ml-1 text-[10px] text-plume-400 hover:underline"
                  >
                    Open folder →
                  </button>
                )}
              </div>

              {/* Description */}
              {assignment.description ? (
                <div
                  className="prose prose-invert max-w-none text-[10px] leading-relaxed text-zinc-400"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(assignment.description) }}
                />
              ) : (
                <p className="text-[10px] italic text-zinc-600">No description</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Announcement Row ──────────────────────────────────────────────────────────

function AnnouncementRow({
  announcement,
  isLast,
}: {
  announcement: Announcement
  isLast: boolean
}) {
  const timeAgo = announcement.postedAt ? getRelativeTime(announcement.postedAt) : ''
  return (
    <div className={`px-3 py-2 ${isLast ? '' : 'border-b border-white/5'}`}>
      <div className="mb-0.5 truncate text-[11px] font-semibold text-zinc-100">
        {announcement.title}
      </div>
      <div className="mb-1 flex items-center gap-1">
        <span className="text-[9px] text-zinc-500">{announcement.authorName}</span>
        <span className="text-[9px] text-zinc-700">·</span>
        <span className="text-[9px] text-zinc-500">{timeAgo}</span>
      </div>
      <div className="line-clamp-2 text-[10px] leading-snug text-zinc-500">
        {announcement.message}
      </div>
    </div>
  )
}

// ── Split handle ──────────────────────────────────────────────────────────────

function HorizontalSplitHandle({ onMouseDown }: { onMouseDown: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative z-10 flex h-[8px] flex-shrink-0 cursor-row-resize items-center justify-center"
    >
      <div
        className={`h-[1px] w-full rounded transition-all duration-150 ${
          hovered ? 'h-[3px] bg-plume-500' : 'bg-white/10'
        }`}
      />
      {hovered && (
        <div className="absolute flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[3px] w-[3px] rounded-full bg-white" />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Empty state + time helper ─────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      {icon}
      <p className="text-base font-medium text-zinc-300">{title}</p>
      <p className="max-w-sm text-sm text-zinc-500">{subtitle}</p>
      {action}
    </div>
  )
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
