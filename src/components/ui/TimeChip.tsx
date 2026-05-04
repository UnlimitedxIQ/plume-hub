import React from 'react'

interface TimeChipProps {
  active?: boolean
  count?: number
  onClick?: () => void
  children: React.ReactNode
}

/**
 * Filter chip used in the Canvas time-axis row. Today / Tomorrow / This week
 * / Later. Active state borrows plume-yellow on the border so the lit chip
 * reads as the brand.
 */
export function TimeChip({ active, count, onClick, children }: TimeChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`time-chip ${active ? 'is-active' : ''}`}
    >
      <span>{children}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="time-chip-count">{count}</span>
      )}
    </button>
  )
}
