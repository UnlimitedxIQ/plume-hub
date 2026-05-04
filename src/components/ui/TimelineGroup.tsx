import React from 'react'

interface TimelineGroupProps {
  label: string
  count: number
  hint?: string
  children: React.ReactNode
}

/**
 * A time-bucket header (Today, Tomorrow, ...) plus its rows. The label is
 * sticky at the top of the bucket so it stays visible as the user scrolls
 * through the week.
 */
export function TimelineGroup({ label, count, hint, children }: TimelineGroupProps) {
  return (
    <section>
      <div className="timeline-group-label">
        <span className="label">{label}</span>
        <span className="count">{count}</span>
        {hint && <span className="ml-auto text-micro text-stone-500">{hint}</span>}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}
