import React from 'react'
import type { DayBucket, Urgency } from './timeline'
import { urgencyOf } from './timeline'

interface Props {
  buckets: DayBucket[]
  /** ISO yyyy-mm-dd of the selected day, or null for "show all". */
  selectedKey: string | null
  /** Called with a day key to filter, or null to clear. */
  onSelect: (key: string | null) => void
}

/**
 * 14-day calendar strip across the top of Canvas. Each day is a thin column
 * with stacked urgency-colored bars per assignment. Click a column to filter
 * the list below; click again to clear.
 *
 * The strip is the "macro view" of the workload, and the list below does the
 * launching. Together they give the student both an at-a-glance read of the
 * week and a one-click action surface.
 */
export function DayStrip({ buckets, selectedKey, onSelect }: Props) {
  const now = Date.now()
  const totalAhead = buckets.reduce((acc, b) => acc + b.assignments.length, 0)

  return (
    <nav aria-label="Workload by day" className="day-strip">
      {buckets.map((b) => {
        const isSelected = selectedKey === b.key
        const isFiltered = selectedKey !== null && !isSelected
        const count = b.assignments.length
        // Sort the bars worst-first so the most urgent thing reads first.
        const urgencies = b.assignments
          .map((a) => urgencyOf(a.dueAt, now))
          .sort(urgencySortDesc)
        const visible = urgencies.slice(0, 4)
        const overflow = urgencies.length - visible.length
        return (
          <button
            key={b.key}
            type="button"
            onClick={() => onSelect(isSelected ? null : b.key)}
            aria-pressed={isSelected}
            aria-label={`${b.weekday} ${b.day}, ${count} ${count === 1 ? 'assignment' : 'assignments'}`}
            title={count > 0 ? b.assignments.map((a) => a.name).join('\n') : 'Nothing due'}
            className={`day-cell ${isSelected ? 'is-selected' : ''} ${isFiltered ? 'is-faded' : ''}`}
          >
            <div className="day-bars">
              {visible.length === 0 ? (
                <span className="bar bar-empty" />
              ) : (
                visible.map((u, i) => <span key={i} className={`bar bar-${u}`} />)
              )}
              {overflow > 0 && <span className="day-overflow">+{overflow}</span>}
            </div>
            <div className="day-foot">
              <span className={`day-num ${b.isToday ? 'is-today' : ''}`}>{b.day}</span>
              <span className="day-abbr">
                {b.monthCap ? `${b.monthCap} ${b.weekday[0]}` : b.weekday[0]}
              </span>
            </div>
          </button>
        )
      })}
      {totalAhead === 0 && (
        <div className="day-strip-empty">Nothing due in the next two weeks.</div>
      )}
    </nav>
  )
}

// Sort urgencies worst-first: overdue, tonight, soon, later, noDate.
const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 0,
  tonight: 1,
  soon: 2,
  later: 3,
  noDate: 4,
}
function urgencySortDesc(a: Urgency, b: Urgency): number {
  return URGENCY_RANK[a] - URGENCY_RANK[b]
}
