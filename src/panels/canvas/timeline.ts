import type { Assignment } from '../../lib/canvas-types'

export type BucketId = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'later' | 'noDate'

export interface Bucket {
  id: BucketId
  label: string
  hint?: string
  assignments: Assignment[]
}

const MS_DAY = 86400000

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfWeek(t: number): number {
  const d = new Date(startOfDay(t))
  // Sunday-end week. Move forward until Sunday at 23:59:59.
  const day = d.getDay() // 0 Sun, 1 Mon...
  const daysUntilSunday = (7 - day) % 7
  d.setDate(d.getDate() + daysUntilSunday)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function classify(now: number, dueAt: string | null): BucketId {
  if (!dueAt) return 'noDate'
  const due = new Date(dueAt).getTime()
  if (isNaN(due)) return 'noDate'
  const today0 = startOfDay(now)
  const tomorrow0 = today0 + MS_DAY
  const dayAfterTomorrow0 = today0 + 2 * MS_DAY
  const thisWeekEnd = endOfWeek(now)
  const nextWeekEnd = thisWeekEnd + 7 * MS_DAY

  if (due < today0) return 'overdue'
  if (due < tomorrow0) return 'today'
  if (due < dayAfterTomorrow0) return 'tomorrow'
  if (due <= thisWeekEnd) return 'thisWeek'
  if (due <= nextWeekEnd) return 'nextWeek'
  return 'later'
}

const BUCKET_ORDER: BucketId[] = [
  'overdue',
  'today',
  'tomorrow',
  'thisWeek',
  'nextWeek',
  'later',
  'noDate',
]

const BUCKET_LABELS: Record<BucketId, string> = {
  overdue:  'Overdue',
  today:    'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This week',
  nextWeek: 'Next week',
  later:    'Later',
  noDate:   'No due date',
}

/**
 * Group assignments into time buckets for the Canvas timeline. Returns
 * buckets in order, dropping empty ones except keeping the empty Today
 * bucket when nothing is due tonight (so we can show the "sleep well"
 * empty state inline).
 */
export function bucketAssignments(assignments: Assignment[], now: number = Date.now()): Bucket[] {
  const groups: Record<BucketId, Assignment[]> = {
    overdue: [], today: [], tomorrow: [], thisWeek: [], nextWeek: [], later: [], noDate: [],
  }
  for (const a of assignments) {
    if (a.submitted) continue
    groups[classify(now, a.dueAt)].push(a)
  }
  // Sort each bucket by due time ascending. Overdue buckets sort by most
  // recently overdue last (so the urgent stuff lands at the top).
  for (const id of BUCKET_ORDER) {
    groups[id].sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
  }
  const out: Bucket[] = []
  for (const id of BUCKET_ORDER) {
    const list = groups[id]
    if (list.length === 0 && id !== 'today') continue
    out.push({ id, label: BUCKET_LABELS[id], assignments: list })
  }
  return out
}

/**
 * Compact label for one assignment's due time. "Tonight 11:59 PM",
 * "Tomorrow 9 AM", "Fri Mar 14 11 AM", "in 2 weeks".
 */
export function formatDueLabel(dueAt: string | null, now: number = Date.now()): string {
  if (!dueAt) return ''
  const due = new Date(dueAt).getTime()
  if (isNaN(due)) return ''

  const bucket = classify(now, dueAt)
  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  switch (bucket) {
    case 'overdue': {
      const ago = Math.floor((now - due) / MS_DAY)
      if (ago < 1) return 'Overdue today'
      if (ago === 1) return '1 day overdue'
      return `${ago} days overdue`
    }
    case 'today':    return `Tonight ${fmtTime(due)}`
    case 'tomorrow': return `Tomorrow ${fmtTime(due)}`
    case 'thisWeek':
    case 'nextWeek':
    case 'later':    return `${fmtDate(due)} ${fmtTime(due)}`
    case 'noDate':   return ''
  }
}

// ── Urgency ────────────────────────────────────────────────────────────────
// Three-level urgency for color coding across the panel:
//   tonight   = due before tomorrow's start  (red)
//   soon      = due within the next 3 days   (amber)
//   later     = anything else with a date    (green)
//   overdue   = past due, treated as red
//   noDate    = no due date set, neutral

export type Urgency = 'overdue' | 'tonight' | 'soon' | 'later' | 'noDate'

export function urgencyOf(dueAt: string | null, now: number = Date.now()): Urgency {
  if (!dueAt) return 'noDate'
  const due = new Date(dueAt).getTime()
  if (isNaN(due)) return 'noDate'
  if (due < now) return 'overdue'
  const today0 = startOfDay(now)
  const tomorrow0 = today0 + MS_DAY
  if (due < tomorrow0) return 'tonight'
  const threeDaysOut = today0 + 3 * MS_DAY
  if (due < threeDaysOut) return 'soon'
  return 'later'
}

// ── Day buckets for the DayStrip ────────────────────────────────────────────
// Group assignments by calendar day for the next N days starting today. Each
// bucket holds the assignments due that day plus a count + worst-urgency for
// quick rendering of strip cells.

export interface DayBucket {
  /** Start-of-day timestamp for this day. */
  start: number
  /** ISO yyyy-mm-dd key, useful for selection. */
  key: string
  /** Whether this day is today. */
  isToday: boolean
  /** Day-of-month number (1-31). */
  day: number
  /** Three-letter weekday abbreviation. */
  weekday: string
  /** Three-letter month abbreviation, only emitted on the 1st of a month. */
  monthCap?: string
  /** Assignments due on this day. */
  assignments: Assignment[]
}

function dayKey(t: number): string {
  const d = new Date(t)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function dayBuckets(
  assignments: Assignment[],
  days: number = 14,
  now: number = Date.now(),
): DayBucket[] {
  const today0 = startOfDay(now)
  const buckets: DayBucket[] = []
  for (let i = 0; i < days; i++) {
    const start = today0 + i * MS_DAY
    const d = new Date(start)
    buckets.push({
      start,
      key: dayKey(start),
      isToday: i === 0,
      day: d.getDate(),
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      monthCap: d.getDate() === 1 || i === 0
        ? d.toLocaleDateString(undefined, { month: 'short' })
        : undefined,
      assignments: [],
    })
  }
  for (const a of assignments) {
    if (a.submitted) continue
    if (!a.dueAt) continue
    const due = new Date(a.dueAt).getTime()
    if (isNaN(due)) continue
    if (due < today0) continue // overdue, not in the next-14-days window
    const offset = Math.floor((startOfDay(due) - today0) / MS_DAY)
    if (offset < 0 || offset >= days) continue
    buckets[offset].assignments.push(a)
  }
  // Sort each bucket's assignments by due time ascending.
  for (const b of buckets) {
    b.assignments.sort((a, c) => {
      const ax = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
      const cx = c.dueAt ? new Date(c.dueAt).getTime() : Infinity
      return ax - cx
    })
  }
  return buckets
}
