'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS, SavedTrade } from '@/lib/types'
import { SignFreeAgentsPanelContent, getAvailableFreeAgents } from '@/components/sign-free-agents-panel'
import { TradesPanelContent } from '@/components/trades-panel'
import { SavedContractsPanelContent } from '@/components/saved-contracts-panel'
import { SigningExceptionsPanel } from '@/components/signing-exceptions-panel'
import { TradeExceptionsPanel } from '@/components/trade-exceptions-panel'
import { TradeModal } from '@/components/trade-modal'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type PanelKey = 'fa' | 'trades' | 'saved'

export function MobilePanelTabs() {
  const { savedContracts, savedTrades, selectedTeam } = useRoster()
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null)
  const [selectedYear, setSelectedYear] = useState(SEASONS[1])
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<SavedTrade | null>(null)

  const tabs: { key: PanelKey; label: string; count: number }[] = [
    { key: 'fa', label: 'Free Agents', count: getAvailableFreeAgents(selectedYear, savedContracts).length },
    { key: 'trades', label: 'Trades', count: savedTrades.length },
    { key: 'saved', label: 'Saved', count: savedContracts.length },
  ]

  return (
    <div className="shrink-0 px-4 pt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const active = activePanel === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActivePanel(active ? null : tab.key)}
              className="flex-1 rounded-[10px] py-2.5 px-1.5 flex flex-col items-center gap-0.5 shadow-sm"
              style={{ background: active ? selectedTeam.primaryColor : 'var(--card)' }}
            >
              <span className={cn("text-[11.5px] font-bold", active ? "text-white" : "text-foreground")}>
                {tab.label}
              </span>
              <span className={cn("text-[9.5px] font-semibold", active ? "text-white/80" : "text-muted-foreground")}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {activePanel === 'fa' && (
        <div className="bg-card rounded-xl p-2.5 flex flex-col gap-2">
          <SignFreeAgentsPanelContent selectedYear={selectedYear} onSelectedYearChange={setSelectedYear} />
        </div>
      )}

      {activePanel === 'trades' && (
        <div className="bg-card rounded-xl p-2.5 flex flex-col gap-2.5">
          <button
            onClick={() => { setEditingTrade(null); setIsTradeModalOpen(true) }}
            className="self-center flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-[10px] text-white"
            style={{ background: selectedTeam.primaryColor }}
          >
            <Plus className="h-3.5 w-3.5" />
            Build Trade
          </button>
          <TradesPanelContent onEditTrade={(trade) => { setEditingTrade(trade); setIsTradeModalOpen(true) }} />
          <TradeModal
            isOpen={isTradeModalOpen}
            onClose={() => { setIsTradeModalOpen(false); setEditingTrade(null) }}
            editingTrade={editingTrade ?? undefined}
          />
        </div>
      )}

      {activePanel === 'saved' && (
        <div className="bg-card rounded-xl p-2.5 max-h-[260px] overflow-y-auto flex flex-col gap-2.5">
          <SavedContractsPanelContent />
          <SigningExceptionsPanel />
          <TradeExceptionsPanel />
        </div>
      )}
    </div>
  )
}
