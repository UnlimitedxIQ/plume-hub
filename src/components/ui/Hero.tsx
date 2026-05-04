import React from 'react'

interface HeroProps {
  children: React.ReactNode
  className?: string
}

/**
 * Hero band: the committed-brand surface. Used at the top of Canvas, on the
 * Onboarding teaser, and as the Session header. Solid plume green so the
 * brand is on screen anywhere the user looks.
 */
export function Hero({ children, className }: HeroProps) {
  return <div className={`hero-band ${className ?? ''}`}>{children}</div>
}
