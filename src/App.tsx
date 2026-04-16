import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Shell } from './components/Shell'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { CanvasPanel } from './panels/CanvasPanel'
import { LibraryPanel } from './panels/LibraryPanel'
import { MarketplacePanel } from './panels/MarketplacePanel'
import { WritingStylePanel } from './panels/WritingStylePanel'
import { SessionPanel } from './panels/SessionPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { useStore, type TabId } from './lib/store'
import { onNavigate, getSettings } from './lib/bridge'

const PANELS: Record<TabId, React.ReactNode> = {
  canvas: <CanvasPanel />,
  library: <LibraryPanel />,
  marketplace: <MarketplacePanel />,
  style: <WritingStylePanel />,
  session: <SessionPanel />,
  settings: <SettingsPanel />,
}

export function App() {
  const { activeTab, setActiveTab } = useStore()
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      const settings = s as { onboardingComplete?: boolean }
      setOnboardingDone(settings.onboardingComplete === true)
    })

    onNavigate((panel) => {
      if (panel === 'settings') setActiveTab('settings')
    })
  }, [setActiveTab])

  // Still loading settings — render nothing to avoid flash
  if (onboardingDone === null) return null

  if (!onboardingDone) {
    return <OnboardingOverlay onComplete={() => setOnboardingDone(true)} />
  }

  return (
    <Shell activeTab={activeTab} onTabClick={setActiveTab}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.12 }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {PANELS[activeTab]}
        </motion.div>
      </AnimatePresence>
    </Shell>
  )
}
