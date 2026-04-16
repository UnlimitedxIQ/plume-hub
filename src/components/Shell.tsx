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
      {/* Left rail: brand + 5 tabs */}
      <div className="flex w-16 flex-col items-center gap-2 border-r border-white/8 bg-zinc-900/80 pt-4 pb-4">
        {/* Brand mark — real app icon (the rounded square is baked into the PNG) */}
        <img
          src={iconUrl}
          alt="Plume Hub"
          className="mb-2 h-10 w-10 rounded-xl shadow-md shadow-plume-900/40"
          draggable={false}
        />

        <div className="h-px w-8 bg-white/8" />

        {TABS.map(({ id, Icon, label }) => {
          const isActive = id === activeTab
          return (
            <button
              key={id}
              onClick={() => onTabClick(id)}
              title={label}
              className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? 'bg-plume-500/20 text-plume-400'
                  : 'text-zinc-500 hover:bg-white/8 hover:text-zinc-300'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-plume-500" />
              )}
              <Icon size={18} />
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
