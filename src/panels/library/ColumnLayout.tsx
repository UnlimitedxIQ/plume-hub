import type { ReactNode } from 'react'

// Three independent scrollable columns with a thin divider between. Each child
// gets its own overflow container so scrolling one column doesn't pull the
// others along. The outer container `grid-cols-3` distributes evenly —
// individual columns can still size their contents however they like.
export function ColumnLayout({ children }: { children: [ReactNode, ReactNode, ReactNode] }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 divide-x divide-white/8 overflow-hidden">
      {children.map((c, i) => (
        <div key={i} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {c}
        </div>
      ))}
    </div>
  )
}
