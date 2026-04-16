import { useState } from 'react'
import { BookOpen, Wand2, Server, RefreshCw } from 'lucide-react'
import { AgentsTab } from './library/AgentsTab'
import { SkillsTab } from './library/SkillsTab'
import { McpsTab } from './library/McpsTab'
import { ColumnLayout } from './library/ColumnLayout'
import { useMediaQuery } from '../lib/useMediaQuery'

type Tab = 'agents' | 'skills' | 'mcps'

// At ≥ 900px the Library is rich enough to show all three categories side-by-
// side; below that threshold the columns become too narrow and we fall back
// to the tabbed view (current behaviour before this refactor).
const COLUMN_BREAKPOINT = '(min-width: 900px)'

export function LibraryPanel() {
  const isWide = useMediaQuery(COLUMN_BREAKPOINT)
  const [tab, setTab] = useState<Tab>('agents')
  // Bumped by the shared "Refresh all" button so each tab re-fetches in sync.
  const [refreshSignal, setRefreshSignal] = useState(0)

  if (isWide) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Library</span>
          <span className="ml-auto" />
          <button
            onClick={() => setRefreshSignal((n) => n + 1)}
            title="Refresh all three columns"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <ColumnLayout>
          <AgentsTab mode="column" refreshSignal={refreshSignal} />
          <SkillsTab mode="column" refreshSignal={refreshSignal} />
          <McpsTab mode="column" refreshSignal={refreshSignal} />
        </ColumnLayout>
      </div>
    )
  }

  // Narrow window fallback — keep the existing tab experience unchanged so
  // the user never loses access to anything when shrinking the window.
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-white/8 px-4 py-2">
        <TabBtn active={tab === 'agents'} onClick={() => setTab('agents')} icon={<BookOpen size={13} />} label="Agents" />
        <TabBtn active={tab === 'skills'} onClick={() => setTab('skills')} icon={<Wand2 size={13} />} label="Skills" />
        <TabBtn active={tab === 'mcps'} onClick={() => setTab('mcps')} icon={<Server size={13} />} label="MCPs" />
      </div>

      {tab === 'agents' && <AgentsTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'mcps' && <McpsTab />}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-plume-500/15 text-plume-300'
          : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
