import React from 'react'
import { GraduationCap, BookOpen, Store, Feather, Eye, Settings } from 'lucide-react'
import type { TabId } from '../lib/store'
import iconUrl from '../../assets/icon.png'

interface ShellProps {
  children: React.ReactNode
  activeTab: TabId
  onTabClick: (tab: TabId) => void
}

const TABS: { id: TabId; Icon: React.ElementType; label: string }[] = [
  { id: 'canvas',      Icon: GraduationCap, label: 'Canvas' },
  { id: 'library',     Icon: BookOpen,      label: 'Library' },
  { id: 'marketplace', Icon: Store,         label: 'Market' },
  { id: 'style',       Icon: Feather,       label: 'Voice' },
  { id: 'session',     Icon: Eye,           label: 'Live' },
  { id: 'settings',    Icon: Settings,      label: 'Settings' },
]

export function Shell({ children, activeTab, onTabClick }: ShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-950">
      {/* Left rail: brand mark + 6 labeled tabs. Wider than before so the
          labels can sit under the icons; tooltips are no longer the whole UX. */}
      <nav
        aria-label="Primary"
        className="surface-rail border-r border-subtle flex w-20 flex-col items-stretch gap-0.5 px-2 pt-3 pb-3"
      >
        {/* Brand mark ,  clickable, returns to Canvas */}
        <button
          onClick={() => onTabClick('canvas')}
          aria-label="Plume Hub home"
          className="mx-auto mb-2 rounded-xl outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-plume-300/40"
        >
          <img
            src={iconUrl}
            alt=""
            className="brand-mark h-9 w-9 rounded-xl shadow-md shadow-plume-900/40"
            draggable={false}
          />
        </button>

        <div className="mx-auto h-px w-8 border-faint border-t" />

        {TABS.map(({ id, Icon, label }) => {
          const isActive = id === activeTab
          return (
            <button
              key={id}
              onClick={() => onTabClick(id)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors duration-quick ease-quiet outline-none focus-visible:ring-2 focus-visible:ring-plume-300/40 ${
                isActive
                  ? 'bg-plume-700/50 text-white'
                  : 'text-stone-500 hover:bg-white/5 hover:text-stone-200'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className={`text-micro font-medium leading-none tracking-wide ${isActive ? 'text-white' : 'text-stone-500 group-hover:text-stone-300'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Panel content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
