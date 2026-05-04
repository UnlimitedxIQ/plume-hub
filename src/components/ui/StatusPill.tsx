import React from 'react'

type Tone = 'plume' | 'yellow' | 'success' | 'warn' | 'danger' | 'zinc'

interface StatusPillProps {
  tone?: Tone
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}

const TONE_CLASS: Record<Tone, string> = {
  plume: 'pill-plume',
  yellow: 'pill-yellow',
  success: 'pill-success',
  warn: 'pill-warn',
  danger: 'pill-danger',
  zinc: 'pill-zinc',
}

export function StatusPill({ tone = 'zinc', icon, children, className }: StatusPillProps) {
  return (
    <span className={`pill ${TONE_CLASS[tone]} ${className ?? ''}`}>
      {icon}
      {children}
    </span>
  )
}
