import React from 'react'
import { GraduationCap, BookOpen, Store, Settings } from 'lucide-react'
import type { TabId } from '../lib/store'

const TABS: { id: TabId; Icon: React.ElementType; label: string }[] = [
  { id: 'canvas', Icon: GraduationCap, label: 'Canvas' },
  { id: 'library', Icon: BookOpen, label: 'Library' },
  { id: 'marketplace', Icon: Store, label: 'Marketplace' },
  { id: 'settings', Icon: Settings, label: 'Settings' },
]

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex w-12 flex-col items-center gap-1 border-r border-white/8 bg-zinc-900/60 pt-10 pb-4">
      {TABS.map(({ id, Icon, label }) => {
        const isActive = id === activeTab
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            title={label}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              isActive
                ? 'bg-plume-500/20 text-plume-400'
                : 'text-zinc-500 hover:bg-white/8 hover:text-zinc-300'
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-plume-500" />
            )}
            <Icon size={16} />
          </button>
        )
      })}
    </div>
  )
}
