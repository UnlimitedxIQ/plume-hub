import React from 'react'
import { GraduationCap, BookOpen, Store, Feather, Eye, Settings } from 'lucide-react'
import type { TabId } from '../lib/store'
// Vite-imported as a fingerprinted URL at build time — the master 1024×1024
// PNG downscales cleanly at the 40×40 render size used in the rail.
import iconUrl from '../../assets/icon.png'

interface ShellProps {
  children: React.ReactNode
  activeTab: TabId
  onTabClick: (tab: TabId) => void
}

const TABS: { id: TabId; Icon: React.ElementType; label: string }[] = [
  { id: 'canvas',      Icon: GraduationCap, label: 'Canvas' },
  { id: 'library',     Icon: BookOpen,      label: 'Library' },
  { id: 'marketplace', Icon: Store,         label: 'Marketplace' },
  { id: 'style',       Icon: Feather,       label: 'Writing Style' },
  { id: 'session',     Icon: Eye,           label: 'Live Preview' },
  { id: 'settings',    Icon: Settings,      label: 'Settings' },
]

export function Shell({ children, activeTab, onTabClick }: ShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950">
      {/* Left rail: brand + 6 tabs */}
      <div className="flex w-14 flex-col items-center gap-1.5 border-r border-white/[0.08] bg-zinc-900/80 pt-3 pb-3">
        {/* Brand mark — clickable, returns to Canvas */}
        <button
          onClick={() => onTabClick('canvas')}
          title="Plume Hub"
          className="mb-1 rounded-xl outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-plume-500/50"
        >
          <img
            src={iconUrl}
            alt="Plume Hub"
            className="h-9 w-9 rounded-xl shadow-md shadow-plume-900/40"
            draggable={false}
          />
        </button>

        <div className="h-px w-6 bg-white/[0.08]" />

        {TABS.map(({ id, Icon, label }) => {
          const isActive = id === activeTab
          return (
            <button
              key={id}
              onClick={() => onTabClick(id)}
              title={label}
              className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? 'border-l-2 border-plume-500 bg-plume-500/15 text-plume-300'
                  : 'border-l-2 border-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
              }`}
            >
              <Icon size={isActive ? 20 : 18} />
            </button>
          )
        })}
      </div>

      {/* Panel content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
