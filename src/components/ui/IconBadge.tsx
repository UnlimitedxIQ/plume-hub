import React from 'react'

type Size = 'sm' | 'md' | 'lg'
type Tone = 'plume' | 'yellow' | 'zinc' | 'emerald' | 'rose'

interface IconBadgeProps {
  size?: Size
  tone?: Tone
  children: React.ReactNode
  className?: string
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-7 w-7 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-14 w-14 rounded-2xl',
}

const TONE_CLASS: Record<Tone, string> = {
  plume: 'bg-plume-500/15 text-plume-300',
  yellow: 'bg-plumeyellow-500/15 text-plumeyellow-400',
  zinc: 'bg-white/5 text-stone-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  rose: 'bg-rose-500/15 text-rose-400',
}

export function IconBadge({ size = 'md', tone = 'zinc', children, className }: IconBadgeProps) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center justify-center ${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${className ?? ''}`}>
      {children}
    </span>
  )
}
