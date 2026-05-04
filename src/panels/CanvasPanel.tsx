import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, AlertCircle, Lock, RefreshCw, Send,
  ChevronUp, Megaphone,
} from 'lucide-react'
import {
  listUpcoming,
  listCourses,
  listAnnouncements,
  listInstructors,
  sendCanvasMessage,
  getSettings,
} from '../lib/bridge'
import type { Assignment } from '../lib/canvas-types'
import { Hero, TimelineGroup, AssignmentRow, StatusPill } from '../components/ui'
import { bucketAssignments, formatDueLabel, dayBuckets } from './canvas/timeline'
import { DayStrip } from './canvas/DayStrip'

// Filter dimensions: course pills narrow the assignment list; clicking a day
// in the DayStrip filters to that day. Both default to "all" so the dashboard
// opens showing everything due ahead.

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

export function CanvasPanel() {
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasToken, setHasToken] = useState(true)

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [activeCourseIds, setActiveCourseIds] = useState<Set<number>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)

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
        setError(upcomingResult.error ?? 'Could not load assignments')
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

  useEffect(() => { fetch() }, [fetch])

  const courseByCode = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of courses) m.set(c.id, c.courseCode)
    return m
  }, [courses])

  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
    [courses],
  )

  // Filter pipeline: course-filter narrows the assignment list. The DayStrip
  // computes its own day buckets from that, and selecting a day further
  // narrows the timeline list.
  const filteredAssignments = useMemo(() => {
    if (activeCourseIds.size === 0) return assignments
    return assignments.filter((a) => activeCourseIds.has(a.courseId))
  }, [assignments, activeCourseIds])

  const days = useMemo(() => dayBuckets(filteredAssignments, 14), [filteredAssignments])

  // List driven by the day selection: when no day is selected, show every
  // bucket; when a day is selected, show only that day's assignments.
  const buckets = useMemo(() => bucketAssignments(filteredAssignments), [filteredAssignments])

  const visibleBuckets = useMemo(() => {
    const out = buckets.filter((b) => b.id !== 'noDate' || b.assignments.length > 0)
    if (!selectedDayKey) return out
    // Filter each bucket to just the assignments due on the selected day.
    return out
      .map((b) => ({
        ...b,
        assignments: b.assignments.filter((a) => {
          if (!a.dueAt) return false
          const d = new Date(a.dueAt)
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          return `${yyyy}-${mm}-${dd}` === selectedDayKey
        }),
      }))
      .filter((b) => b.assignments.length > 0)
  }, [buckets, selectedDayKey])

  function toggleCourse(id: number) {
    setActiveCourseIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Empty / loading / error states keep the hero band so the brand is on
  // screen even when we have nothing else to show.
  if (!hasToken) {
    return (
      <SurfacePanelWithHero
        title="Canvas not connected"
        subtitle="Add your token in Settings and we'll show you what's due."
      >
        <EmptyState
          icon={<Lock size={28} className="text-stone-500" />}
          title="No Canvas connection yet"
          subtitle="Settings, Canvas LMS section, paste your token. We'll show your assignments here."
        />
      </SurfacePanelWithHero>
    )
  }

  if (loading && courses.length === 0) {
    return (
      <SurfacePanelWithHero title="Loading what's due..." subtitle="One sec.">
        <div className="flex flex-1 flex-col p-6 gap-3">
          {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
        </div>
      </SurfacePanelWithHero>
    )
  }

  if (error) {
    return (
      <SurfacePanelWithHero title="Canvas hit a snag" subtitle={error}>
        <EmptyState
          icon={<AlertCircle size={28} className="text-rose-400" />}
          title="Could not reach Canvas"
          subtitle={error}
          action={
            <button onClick={fetch} className="btn-secondary mt-2 inline-flex items-center gap-1.5">
              <RefreshCw size={12} /> Try again
            </button>
          }
        />
      </SurfacePanelWithHero>
    )
  }

  if (courses.length === 0) {
    return (
      <SurfacePanelWithHero title="No courses found" subtitle="Add tracked course IDs in Settings.">
        <EmptyState
          icon={<GraduationCap size={28} className="text-stone-500" />}
          title="Canvas didn't return any courses"
          subtitle="Check your tracked course IDs in Settings, or hit refresh in a few minutes."
        />
      </SurfacePanelWithHero>
    )
  }

  const totalAhead = filteredAssignments.length
  const subtitle = totalAhead === 0
    ? "Nothing else due. Sleep well."
    : totalAhead === 1
      ? `${totalAhead} thing ahead.`
      : `${totalAhead} things ahead. Pick the next one.`

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Compact hero: headline + count inline, course filter on second row. */}
      <Hero>
        <div className="flex items-center gap-3">
          <h1 className="text-display text-white">What's due</h1>
          <span className="text-sm text-white/80">{subtitle}</span>
          <div className="flex-1" />
          {selectedDayKey && (
            <button
              onClick={() => setSelectedDayKey(null)}
              className="rounded-md border border-white/20 bg-black/20 px-2 py-1 text-micro font-semibold text-white/90 hover:bg-black/30"
            >
              Clear day filter
            </button>
          )}
          <button
            onClick={fetch}
            disabled={loading}
            aria-label="Refresh assignments"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors duration-quick ease-quiet hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {sortedCourses.length > 1 && (
          <div className="-mx-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-micro text-white/60">Courses</span>
            <button
              onClick={() => setActiveCourseIds(new Set())}
              className={`course-pill ${activeCourseIds.size === 0 ? 'is-active' : ''}`}
            >
              All
            </button>
            {sortedCourses.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleCourse(c.id)}
                className={`course-pill ${activeCourseIds.has(c.id) ? 'is-active' : ''}`}
                title={c.name}
              >
                {c.courseCode}
              </button>
            ))}
          </div>
        )}
      </Hero>

      {/* Day strip: 14-day workload view. Click a day to filter. */}
      <DayStrip
        buckets={days}
        selectedKey={selectedDayKey}
        onSelect={setSelectedDayKey}
      />

      {/* Timeline list */}
      <div className="flex-1 overflow-y-auto">
        {visibleBuckets.length === 0 || visibleBuckets.every((b) => b.assignments.length === 0) ? (
          <EmptyState
            icon={null}
            title="Nothing else due tonight."
            subtitle="Sleep well."
          />
        ) : (
          <div className="flex flex-col">
            {visibleBuckets.map((bucket) => (
              bucket.assignments.length === 0 && bucket.id === 'today' && !selectedDayKey ? (
                <TimelineGroup key={bucket.id} label={bucket.label} count={0}>
                  <div className="px-4 py-4 text-xs italic text-stone-500">
                    Nothing due today.
                  </div>
                </TimelineGroup>
              ) : bucket.assignments.length === 0 ? null : (
                <TimelineGroup
                  key={bucket.id}
                  label={bucket.label}
                  count={bucket.assignments.length}
                >
                  {bucket.assignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      assignment={a}
                      courseCode={courseByCode.get(a.courseId) ?? '—'}
                      dueLabel={formatDueLabel(a.dueAt) || undefined}
                    />
                  ))}
                </TimelineGroup>
              )
            ))}
          </div>
        )}
      </div>

      {/* Announcements drawer pinned to bottom */}
      <AnnouncementsDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
        announcements={announcements}
        courses={sortedCourses}
      />
    </div>
  )
}

// ── Announcements drawer ─────────────────────────────────────────────────────

function AnnouncementsDrawer({
  open,
  onToggle,
  announcements,
  courses,
}: {
  open: boolean
  onToggle: () => void
  announcements: Announcement[]
  courses: Course[]
}) {
  const courseByCode = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of courses) m.set(c.id, c.courseCode)
    return m
  }, [courses])

  const sorted = useMemo(
    () =>
      [...announcements].sort((a, b) => {
        if (!a.postedAt) return 1
        if (!b.postedAt) return -1
        return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
      }),
    [announcements],
  )

  return (
    <div className="flex-shrink-0 border-t border-subtle surface-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-6 py-2.5 text-left transition-colors duration-quick ease-quiet hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <Megaphone size={13} className="text-stone-500" />
        <span className="text-xs font-semibold text-stone-200">From your instructors</span>
        <StatusPill tone="zinc">{sorted.length}</StatusPill>
        <div className="flex-1" />
        <ChevronUp
          size={13}
          className="text-stone-500 transition-transform duration-mid ease-quiet"
          style={{ transform: open ? 'rotate(0)' : 'rotate(180deg)' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-subtle"
          >
            <div className="max-h-72 overflow-y-auto">
              {sorted.length === 0 ? (
                <div className="px-6 py-6 text-xs italic text-stone-500">
                  No announcements right now.
                </div>
              ) : (
                sorted.map((a) => (
                  <AnnouncementRow
                    key={a.id}
                    announcement={a}
                    courseCode={courseByCode.get(a.courseId) ?? ''}
                  />
                ))
              )}
            </div>
            <ReplyComposer courses={courses} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AnnouncementRow({
  announcement,
  courseCode,
}: {
  announcement: Announcement
  courseCode: string
}) {
  const [expanded, setExpanded] = useState(false)
  const message = announcement.message ?? ''
  const isLong = message.length > 220
  const timeAgo = announcement.postedAt ? getRelativeTime(announcement.postedAt) : ''

  return (
    <div className="border-b border-faint px-6 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-micro font-semibold text-plume-300">{courseCode}</span>
        <span className="text-xs font-semibold text-stone-100">{announcement.title}</span>
        <div className="flex-1" />
        <span className="text-micro text-stone-500">{announcement.authorName} · {timeAgo}</span>
      </div>
      <div className={`mt-1 text-xs leading-snug text-stone-400 ${expanded ? '' : 'line-clamp-2'}`}>
        {message}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-micro font-semibold text-plume-300 hover:text-plume-200"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function ReplyComposer({ courses }: { courses: Course[] }) {
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
      const subject = course ? `Question about ${course.courseCode}` : 'Canvas message'

      const instructorsResult = await listInstructors(selectedCourseId as number)
      if (!instructorsResult.ok || !instructorsResult.instructors) {
        setResult({ ok: false, msg: 'Could not load instructors' })
        setSending(false)
        return
      }
      const instructors = instructorsResult.instructors as { id: number; name: string }[]
      if (instructors.length === 0) {
        setResult({ ok: false, msg: 'No instructor found' })
        setSending(false)
        return
      }
      const recipientIds = instructors.map((i) => String(i.id))
      const sendResult = await sendCanvasMessage({ recipientIds, subject, body: body.trim() })
      if (sendResult.ok) {
        setResult({ ok: true, msg: 'Sent.' })
        setBody('')
        setSelectedCourseId('')
        setTimeout(() => setResult(null), 3000)
      } else {
        setResult({ ok: false, msg: sendResult.error ?? 'Send failed' })
      }
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const canSend = !sending && body.trim().length > 0 && selectedCourseId !== ''

  return (
    <div className="border-t border-subtle px-6 py-3">
      <div className="flex items-center gap-2 pb-2">
        <Send size={11} className="text-plumeyellow-400" />
        <span className="section-label">Reply to your instructor</span>
        <div className="flex-1" />
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value === '' ? '' : Number(e.target.value))}
          className={`rounded-md border border-subtle bg-ink-800 px-2 py-1 text-micro font-semibold outline-none ${
            selectedCourseId === '' ? 'text-stone-500' : 'text-stone-200'
          }`}
        >
          <option value="" className="bg-ink-800">Select course...</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id} className="bg-ink-800 text-stone-200">
              {c.courseCode}
            </option>
          ))}
        </select>
        {result && (
          <span className={`text-micro font-semibold ${result.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {result.msg}
          </span>
        )}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="btn-yellow px-3 py-1 text-micro disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={11} />
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your question..."
        rows={2}
        className="w-full resize-none rounded-md border border-subtle surface-2 px-3 py-2 text-xs leading-relaxed text-stone-200 placeholder-stone-500 outline-none focus:border-plume-500/60"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            handleSend()
          }
        }}
      />
      <div className="text-right text-micro text-stone-600">Ctrl+Enter to send</div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SurfacePanelWithHero({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Hero>
        <h1 className="text-display text-white">{title}</h1>
        <p className="text-sm text-white/80">{subtitle}</p>
      </Hero>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon}
      <p className="text-base font-semibold text-stone-200">{title}</p>
      <p className="max-w-sm text-sm text-stone-500">{subtitle}</p>
      {action}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg surface-2 p-3 animate-pulse">
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-stone-700" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-2/3 rounded bg-stone-800" />
        <div className="h-2 w-1/3 rounded bg-stone-800" />
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-7 flex-1 rounded-lg bg-stone-800" />)}
        </div>
      </div>
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
