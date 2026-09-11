'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season } from '@/lib/types'
import { getAvailableFreeAgents } from '@/lib/free-agent-pool'
import { useExpandablePanel } from '@/hooks/use-expandable-panel'
import { MobileFreeAgentsPanel } from '@/components/mobile/mobile-free-agents-panel'
import { MobileTradesPanel } from '@/components/mobile/mobile-trades-panel'
import { cn } from '@/lib/utils'

type PanelKey = 'fa' | 'trades'

// Caps how much vertical space the panels can take, so the cap sheet below is
// never pushed off screen. On a short device it just caps lower.
const PANELS_MAX_HEIGHT = 378

export function MobilePanelTabs() {
  const { savedContracts, savedTrades } = useRoster()
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null)
  const [selectedYear, setSelectedYear] = useState<Season>(SEASONS[0])

  const fa = useExpandablePanel()
  const trades = useExpandablePanel()

  const tabs: { key: PanelKey; label: string; count: number; labelClass?: string }[] = [
    {
      key: 'fa',
      label: 'Free Agents',
      count: getAvailableFreeAgents(selectedYear, savedContracts).length,
      // Two words at the shared tab width only fit on one line a notch smaller.
      labelClass: 'text-[10.5px] whitespace-nowrap',
    },
    { key: 'trades', label: 'Trades', count: savedTrades.length },
  ]

  function selectPanel(key: PanelKey) {
    if (activePanel === key) {
      // Closing the panel that owns an open overlay would strand the backdrop.
      if (key === 'fa') fa.collapse()
      else trades.collapse()
      setActivePanel(null)
      return
    }
    setActivePanel(key)
  }

  return (
    <div
      className="shrink-0 px-4 pt-4 flex flex-col gap-2 overflow-y-auto"
      style={{ maxHeight: PANELS_MAX_HEIGHT }}
    >
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const active = activePanel === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => selectPanel(tab.key)}
              className={cn(
                'flex-1 rounded-[10px] py-2.5 px-1.5 flex flex-col items-center gap-0.5 shadow-sm',
                active ? 'bg-primary' : 'bg-card'
              )}
            >
              <span className={cn('text-[11.5px] font-bold', tab.labelClass, active ? 'text-primary-foreground' : 'text-foreground')}>
                {tab.label}
              </span>
              <span className={cn('text-[9.5px] font-semibold', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      <div style={fa.backdropStyle} onClick={fa.collapse} />
      {activePanel === 'fa' && (
        <MobileFreeAgentsPanel
          season={selectedYear}
          onSeasonChange={setSelectedYear}
          expanded={fa.expanded}
          onToggleExpand={fa.toggle}
          panelStyle={fa.panelStyle}
          panelRef={fa.ref}
        />
      )}

      <div style={trades.backdropStyle} onClick={trades.collapse} />
      {activePanel === 'trades' && (
        <MobileTradesPanel
          expanded={trades.expanded}
          onToggleExpand={trades.toggle}
          panelStyle={trades.panelStyle}
          panelRef={trades.ref}
        />
      )}
    </div>
  )
}
