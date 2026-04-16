export type DueDateStatus = 'overdue' | 'today' | 'this-week' | 'later' | 'no-date'

export interface FormattedDueDate {
  label: string
  status: DueDateStatus
}

const DAY = 1000 * 60 * 60 * 24

export function formatDueDate(dueAt: string | null | undefined): FormattedDueDate {
  if (!dueAt) return { label: 'No due date', status: 'no-date' }

  const due = new Date(dueAt)
  if (isNaN(due.getTime())) return { label: 'Invalid date', status: 'no-date' }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + DAY)
  const inAWeek = new Date(today.getTime() + 7 * DAY)

  const isToday = due.getFullYear() === now.getFullYear()
    && due.getMonth() === now.getMonth()
    && due.getDate() === now.getDate()

  // Overdue
  if (due.getTime() < now.getTime() && !isToday) {
    const daysAgo = Math.floor((now.getTime() - due.getTime()) / DAY)
    return {
      label: daysAgo === 0 ? 'Overdue' : `Overdue by ${daysAgo}d`,
      status: 'overdue',
    }
  }

  if (isToday) {
    const timeStr = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return { label: `Today at ${timeStr}`, status: 'today' }
  }

  if (due >= tomorrow && due < inAWeek) {
    const weekday = due.toLocaleDateString('en-US', { weekday: 'short' })
    const timeStr = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return { label: `${weekday} ${timeStr}`, status: 'this-week' }
  }

  const dateStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { label: dateStr, status: 'later' }
}

export function formatPoints(points: number | null): string {
  if (points == null) return ''
  if (points === 0) return '0 pts'
  if (Number.isInteger(points)) return `${points} pts`
  return `${points.toFixed(1)} pts`
}

const SUBMISSION_LABELS: Record<string, string> = {
  online_upload: 'Upload',
  online_text_entry: 'Text',
  online_url: 'URL',
  online_quiz: 'Quiz',
  discussion_topic: 'Discussion',
  on_paper: 'On Paper',
  external_tool: 'External',
  media_recording: 'Media',
  not_graded: 'Not Graded',
  none: 'None',
}

export function submissionTypeLabel(type: string): string {
  return SUBMISSION_LABELS[type] ?? type.replace(/_/g, ' ')
}
