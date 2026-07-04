'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SavedTrade } from '@/lib/types'
import { TEAM_NAMES } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react'
import { TradeModal } from './trade-modal'

export function TradesPanel() {
  const { savedTrades, removeSavedTrade } = useRoster()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<SavedTrade | null>(null)

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
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-medium">Trades</CardTitle>
              {savedTrades.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {savedTrades.length} trade{savedTrades.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => { setEditingTrade(null); setIsModalOpen(true) }}
            >
              <Plus className="h-3 w-3" />
              Build Trade
            </Button>
          </div>
        </CardHeader>

        {savedTrades.length > 0 && (
          <CardContent className="pt-0 space-y-2">
            {savedTrades.map((trade) => {
              const teamName = TEAM_NAMES[trade.tradeTeamAbbr] || trade.tradeTeamAbbr
              const outCount = trade.outgoingRosterPlayerIds.length + trade.outgoingPickIds.length
              const inCount = trade.incomingPlayers.length + trade.incomingPicks.length

              return (
                <div
                  key={trade.id}
                  className="flex items-start justify-between p-3 rounded-lg border bg-chart-4/5 border-chart-4/20 hover:bg-chart-4/10 cursor-pointer transition-colors"
                  onClick={() => handleOpenEdit(trade)}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center bg-chart-4/20 shrink-0 mt-0.5">
                      <ArrowLeftRight className="h-4 w-4 text-chart-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Trade with {teamName}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {trade.outgoingRosterPlayerIds.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            <span className="text-red-400">Out:</span>{' '}
                            {trade.outgoingRosterPlayerIds.length} player{trade.outgoingRosterPlayerIds.length !== 1 ? 's' : ''}
                            {trade.outgoingPickIds.length > 0 && `, ${trade.outgoingPickIds.length} pick${trade.outgoingPickIds.length !== 1 ? 's' : ''}`}
                          </p>
                        )}
                        {trade.outgoingRosterPlayerIds.length === 0 && trade.outgoingPickIds.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            <span className="text-red-400">Out:</span>{' '}
                            {trade.outgoingPickIds.length} pick{trade.outgoingPickIds.length !== 1 ? 's' : ''}
                          </p>
                        )}
                        {trade.incomingPlayers.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            <span className="text-emerald-400">In:</span>{' '}
                            {trade.incomingPlayers.map((p) => p.playerName).join(', ')}
                            {trade.incomingPicks.length > 0 && `, ${trade.incomingPicks.length} pick${trade.incomingPicks.length !== 1 ? 's' : ''}`}
                          </p>
                        )}
                        {trade.incomingPlayers.length === 0 && trade.incomingPicks.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            <span className="text-emerald-400">In:</span>{' '}
                            {trade.incomingPicks.length} pick{trade.incomingPicks.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => { e.stopPropagation(); removeSavedTrade(trade.id) }}
                    title="Remove trade"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </CardContent>
        )}
      </Card>

      <TradeModal isOpen={isModalOpen} onClose={handleModalClose} editingTrade={editingTrade ?? undefined} />
    </>
  )
}
