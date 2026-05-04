import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatDueDate, type DueDateStatus } from '../../lib/format'

interface Props {
  dueAt: string | null | undefined
}

const STATUS_CLASSES: Record<DueDateStatus, string> = {
  overdue:     'border-rose-500/30 bg-rose-500/10 text-rose-400',
  today:       'border-orange-500/30 bg-orange-500/10 text-orange-400',
  'this-week': 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  later:       'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  'no-date':   'border-stone-600/30 bg-stone-700/20 text-stone-400',
}

export function CanvasBadge({ dueAt }: Props) {
  const { label, status } = formatDueDate(dueAt)
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-micro font-semibold whitespace-nowrap ${STATUS_CLASSES[status]}`}>
      {status === 'overdue' && <AlertTriangle size={9} />}
      {label}
    </span>
  )
}
