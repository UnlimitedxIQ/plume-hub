export interface Assignment {
  id: number
  courseId: number
  courseCode: string
  name: string
  dueAt: string | null
  pointsPossible: number | null
  htmlUrl: string
  description: string
  submissionTypes: string[]
  /**
   * True when the student has already submitted this assignment (workflow_state
   * of their submission is anything other than "unsubmitted", or submitted_at
   * is set). Used by the dashboard to hide completed work.
   */
  submitted: boolean
}

export type DueGroup = 'today' | 'this-week' | 'later' | 'no-date'

export function getDueGroup(dueAt: string | null): DueGroup {
  if (!dueAt) return 'no-date'
  const due = new Date(dueAt)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)

  if (due < tomorrow) return 'today'
  if (due < nextWeek) return 'this-week'
  return 'later'
}

export const COURSE_COLORS: Record<string, string> = {
  BA: '#f59e0b',
  MGMT: '#3b82f6',
  MKTG: '#10b981',
  ECON: '#8b5cf6',
  CS: '#ef4444',
  MATH: '#f97316',
}

export function courseColor(courseCode: string): string {
  const prefix = courseCode.replace(/[^A-Z]/g, '').slice(0, 4)
  return COURSE_COLORS[prefix] ?? '#6b7280'
}
