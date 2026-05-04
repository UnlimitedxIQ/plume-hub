import { useState } from 'react'
import { BookOpen, Wand2, Server, RefreshCw } from 'lucide-react'
import { AgentsTab } from './library/AgentsTab'
import { SkillsTab } from './library/SkillsTab'
import { McpsTab } from './library/McpsTab'
import { ColumnLayout } from './library/ColumnLayout'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Hero } from '../components/ui'

type Tab = 'agents' | 'skills' | 'mcps'

// At >= 900px the Library shows all three categories side-by-side; below
// that we fall back to a tabbed view so the columns stay legible.
const COLUMN_BREAKPOINT = '(min-width: 900px)'

export function LibraryPanel() {
  const isWide = useMediaQuery(COLUMN_BREAKPOINT)
  const [tab, setTab] = useState<Tab>('agents')
  // Bumped by the shared "Refresh all" button so each tab re-fetches in sync.
  const [refreshSignal, setRefreshSignal] = useState(0)

  const refreshButton = (
    <button
      onClick={() => setRefreshSignal((n) => n + 1)}
      aria-label="Refresh all"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-colors duration-quick ease-quiet hover:bg-white/10 hover:text-white"
    >
      <RefreshCw size={13} />
    </button>
  )

  if (isWide) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <Hero>
          <div className="flex items-center gap-3">
            <h1 className="text-display text-white">Library</h1>
            <div className="flex-1" />
            {refreshButton}
          </div>
          <p className="text-sm text-white/80">
            Agents, skills, and MCPs installed in <code className="rounded bg-black/30 px-1.5 py-0.5 text-micro font-mono">~/.claude/</code>. Read-only on purpose.
          </p>
        </Hero>
        <ColumnLayout>
          <AgentsTab mode="column" refreshSignal={refreshSignal} />
          <SkillsTab mode="column" refreshSignal={refreshSignal} />
          <McpsTab mode="column" refreshSignal={refreshSignal} />
        </ColumnLayout>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Hero>
        <div className="flex items-center gap-3">
          <h1 className="text-display text-white">Library</h1>
          <div className="flex-1" />
          {refreshButton}
        </div>
        <p className="text-sm text-white/80">
          Agents, skills, and MCPs installed in <code className="rounded bg-black/30 px-1.5 py-0.5 text-micro font-mono">~/.claude/</code>.
        </p>
      </Hero>

      <div className="flex items-center gap-1 border-b border-subtle px-4 py-2">
        <TabBtn active={tab === 'agents'} onClick={() => setTab('agents')} icon={<BookOpen size={13} />} label="Agents" />
        <TabBtn active={tab === 'skills'} onClick={() => setTab('skills')} icon={<Wand2 size={13} />} label="Skills" />
        <TabBtn active={tab === 'mcps'} onClick={() => setTab('mcps')} icon={<Server size={13} />} label="MCPs" />
      </div>

      {tab === 'agents' && <AgentsTab refreshSignal={refreshSignal} />}
      {tab === 'skills' && <SkillsTab refreshSignal={refreshSignal} />}
      {tab === 'mcps' && <McpsTab refreshSignal={refreshSignal} />}
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
      className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors duration-quick ease-quiet ${
        active
          ? 'bg-plume-700/40 text-white'
          : 'text-stone-500 hover:bg-white/5 hover:text-stone-200'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
