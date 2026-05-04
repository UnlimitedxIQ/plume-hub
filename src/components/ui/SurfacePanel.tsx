import React from 'react'

interface SurfacePanelProps {
  header: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Extra classes on the section-header. Use to commit the brand colour
      (e.g. `bg-plume-700/50` on the Canvas dashboard). */
  headerClassName?: string
}

/**
 * Standard panel shell: 48px section-header on top, scrollable body below.
 * Used by every panel so the chrome stays identical across Canvas, Library,
 * Marketplace, Writing Style, Session, and Settings.
 */
export function SurfacePanel({ header, children, className, headerClassName }: SurfacePanelProps) {
  return (
    <div className={`flex flex-1 flex-col overflow-hidden ${className ?? ''}`}>
      <div className={`section-header ${headerClassName ?? ''}`}>{header}</div>
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}
