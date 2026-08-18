'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SavedTrade, SEASONS, Season } from '@/lib/types'
import { NormalizedTrade, incomingFor, outgoingFor, partnersOf } from '@/lib/trade-model'
import { TEAM_NAMES, formatCurrency } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeftRight, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { TradeModal } from './trade-modal'
import { cn } from '@/lib/utils'

type SalaryMap = Partial<Record<Season, number>>

// The trade's first affected season, and the selected team's totals for just
// that season — mirrors the design's "Outgoing/Incoming (first season)" card.
// Outgoing assets carry no snapshot of their own (they are resolved live), so
// they are looked up against the live roster and pick lists here.
function getTradeFirstSeasonTotals(
  trade: NormalizedTrade,
  teamAbbr: string,
  roster: { id: string; salary: SalaryMap }[],
  draftPickPlayers: { id: string; salary: SalaryMap }[]
) {
  const outgoing: SalaryMap[] = outgoingFor(trade, teamAbbr).map((m) => {
    const live = roster.find((p) => p.id === m.id) ?? draftPickPlayers.find((p) => p.id === m.id)
    return live?.salary ?? m.salary ?? {}
  })
  const incoming: SalaryMap[] = incomingFor(trade, teamAbbr).map((m) => m.salary ?? {})

  const firstSeasonIndex = SEASONS.findIndex((season) =>
    outgoing.some((s) => s[season]) || incoming.some((s) => s[season])
  )
  const season = SEASONS[firstSeasonIndex === -1 ? 0 : firstSeasonIndex]

  return {
    season,
    outgoingTotal: outgoing.reduce((sum, s) => sum + (s[season] || 0), 0),
    incomingTotal: incoming.reduce((sum, s) => sum + (s[season] || 0), 0),
  }
}

// "Trade with Boston" for a two-team deal; "3-team trade with BOS, LAL" once a
// single partner name no longer describes the deal.
function describeTradePartners(trade: NormalizedTrade, teamAbbr: string): string {
  const partners = partnersOf(trade, teamAbbr)
  if (partners.length <= 1) {
    const only = partners[0]
    return `Trade with ${only ? TEAM_NAMES[only] || only : 'no partner'}`
  }
  return `${trade.teams.length}-team trade with ${partners.join(', ')}`
}

export function TradesPanelContent({ onEditTrade }: { onEditTrade: (trade: SavedTrade) => void }) {
  const { savedTrades, normalizedTrades, selectedTeamAbbr, removeSavedTrade, roster, draftPickPlayers } = useRoster()

  if (savedTrades.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-2">No trades yet</p>
  }

  return (
    <>
      {normalizedTrades.map((trade, index) => {
        const label = describeTradePartners(trade, selectedTeamAbbr)
        const { season, outgoingTotal, incomingTotal } = getTradeFirstSeasonTotals(trade, selectedTeamAbbr, roster, draftPickPlayers)
        const dateLabel = new Date(trade.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

        return (
          <div
            key={trade.id}
            className="rounded-[7px] border border-border overflow-hidden cursor-pointer hover:bg-accent/40 transition-colors"
            onClick={() => onEditTrade(savedTrades[index])}
          >
            <div className="px-2.5 py-2 bg-accent flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                <ArrowLeftRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
                {trade.isSignAndTrade && (
                  <span className="text-[9px] font-normal text-chart-4 bg-chart-4/10 px-1 py-px rounded shrink-0">
                    Sign-and-Trade
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-semibold text-muted-foreground">{dateLabel}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSavedTrade(trade.id) }}
                  className="text-muted-foreground/60 hover:text-destructive transition-colors"
                  title="Remove trade"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="px-2.5 py-2 text-[11.5px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outgoing ({season})</span>
                <span className="font-mono tabular-nums font-medium">{formatCurrency(outgoingTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Incoming ({season})</span>
                <span className="font-mono tabular-nums font-medium">{formatCurrency(incomingTotal)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

export function TradesPanel() {
  const { savedTrades, selectedTeam } = useRoster()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<SavedTrade | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)

  function handleOpenEdit(trade: SavedTrade) {
    setEditingTrade(trade)
    setIsModalOpen(true)
  }

  function handleModalClose() {
    setIsModalOpen(false)
    setEditingTrade(null)
  }

  return (
    <>
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="cursor-pointer rounded-lg overflow-hidden border border-border"
        style={!isCollapsed ? { borderColor: selectedTeam.primaryColor } : undefined}
      >
        <Card className="border-0 rounded-none shadow-none py-0 gap-0">
          <CardHeader
            className={cn(
              "select-none py-2.5 px-3.5 gap-0 transition-colors [.border-b]:pb-2.5",
              isCollapsed ? "bg-accent hover:bg-accent/70" : ""
            )}
            style={!isCollapsed ? { background: selectedTeam.primaryColor } : undefined}
          >
            <div className="flex items-center justify-between">
              <CardTitle className={cn("text-[12.5px] font-semibold flex items-center gap-1.5", !isCollapsed && "text-white")}>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform duration-300",
                    isCollapsed ? "rotate-0 text-muted-foreground" : "rotate-90 text-white/80"
                  )}
                />
                Trades
                <span className={cn("font-medium", isCollapsed ? "text-muted-foreground" : "text-white/75")}>
                  {savedTrades.length}
                </span>
              </CardTitle>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingTrade(null)
                  setIsModalOpen(true)
                }}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-md transition-colors",
                  isCollapsed
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    : "bg-white/90 hover:bg-white"
                )}
                style={!isCollapsed ? { color: selectedTeam.primaryColor } : undefined}
              >
                <Plus className="h-3 w-3" />
                Build Trade
              </button>
            </div>
          </CardHeader>
          <div
            className={`grid transition-all duration-300 ease-in-out ${
              isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-hidden">
              <CardContent className="space-y-2.5 pt-3 pb-3.5">
                <TradesPanelContent onEditTrade={handleOpenEdit} />
              </CardContent>
            </div>
          </div>
        </Card>
      </div>

      <TradeModal isOpen={isModalOpen} onClose={handleModalClose} editingTrade={editingTrade ?? undefined} />
    </>
  )
}
