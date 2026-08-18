'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Player, SavedContract, Season, SEASONS } from '@/lib/types'
import { TEAMS, formatCurrency } from '@/lib/data'
import { isRestrictedFreeAgent } from '@/lib/contract-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronRight, Scale } from 'lucide-react'
import { SignFreeAgentModal } from './sign-free-agent-modal'
import { cn } from '@/lib/utils'

// The player's own team, own player's first season carrying no salary — same
// "first empty season" definition sign-free-agents-panel.tsx's list uses,
// scoped to the currently selected team's roster instead of every team.
function getOwnUnresolvedRFAs(
  roster: Player[],
  savedContracts: SavedContract[],
  deletedContractIds: Set<string>
): Array<{ player: Player; season: Season }> {
  const result: Array<{ player: Player; season: Season }> = []
  roster.forEach((player) => {
    const firstFreeSeason = SEASONS.find((s) => !(player.salary[s] && player.salary[s]! > 0))
    if (!firstFreeSeason) return
    if (!isRestrictedFreeAgent(player.name, firstFreeSeason)) return
    const covered = savedContracts.some(
      (c) => !deletedContractIds.has(c.id) && c.playerId === player.id && (c.salary[firstFreeSeason] ?? 0) > 0
    )
    if (covered) return
    result.push({ player, season: firstFreeSeason })
  })
  return result
}

function summarizeContract(contract: SavedContract) {
  const activeSeasons = SEASONS.filter((s) => (contract.salary[s] ?? 0) > 0)
  const total = activeSeasons.reduce((sum, s) => sum + (contract.salary[s] ?? 0), 0)
  return { years: activeSeasons.length, total, firstSeason: activeSeasons[0] }
}

export function RestrictedFreeAgencyPanelContent() {
  const {
    selectedTeamAbbr,
    roster,
    savedContracts,
    deletedContractIds,
    getPendingOfferSheets,
    matchOfferSheet,
    declineOfferSheet,
  } = useRoster()
  const [qoPlayer, setQoPlayer] = useState<Player | null>(null)
  const [qoSeason, setQoSeason] = useState<Season>(SEASONS[0])

  const pendingOfferSheets = getPendingOfferSheets(selectedTeamAbbr)
  const unresolvedOwnRFAs = getOwnUnresolvedRFAs(roster, savedContracts, deletedContractIds)

  return (
    <>
      <div className="space-y-3">
        {pendingOfferSheets.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Pending offer sheets on your players</p>
            {pendingOfferSheets.map(({ contract, fromTeam }) => {
              const { years, total, firstSeason } = summarizeContract(contract)
              return (
                <div key={contract.id} className="p-2.5 rounded-lg border bg-amber-500/5 border-amber-500/20 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{contract.playerName}</p>
                    <p className="text-xs text-muted-foreground">
                      from {TEAMS[fromTeam]?.name ?? fromTeam}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {years}yr / {formatCurrency(total)} starting {firstSeason}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={() => matchOfferSheet(contract, fromTeam)}>
                      Match
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => declineOfferSheet(contract, fromTeam)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {unresolvedOwnRFAs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Your restricted free agents without a qualifying offer</p>
            {unresolvedOwnRFAs.map(({ player, season }) => (
              <div
                key={player.id}
                onClick={() => {
                  setQoPlayer(player)
                  setQoSeason(season)
                }}
                className="p-2.5 rounded-lg border bg-muted/50 border-muted/20 text-sm cursor-pointer hover:bg-muted transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{player.name}</p>
                  <p className="text-xs text-muted-foreground">{season}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {pendingOfferSheets.length === 0 && unresolvedOwnRFAs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">Nothing pending right now</p>
        )}
      </div>

      <SignFreeAgentModal
        player={qoPlayer}
        startingSeason={qoSeason}
        isOpen={qoPlayer !== null}
        onClose={() => setQoPlayer(null)}
      />
    </>
  )
}

export function RestrictedFreeAgencyPanel() {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const { selectedTeam, selectedTeamAbbr, roster, savedContracts, deletedContractIds, getPendingOfferSheets } = useRoster()

  const count = getPendingOfferSheets(selectedTeamAbbr).length + getOwnUnresolvedRFAs(roster, savedContracts, deletedContractIds).length

  return (
    <div
      onClick={() => setIsCollapsed(!isCollapsed)}
      className="cursor-pointer rounded-lg overflow-hidden border border-border"
      style={!isCollapsed ? { borderColor: selectedTeam.primaryColor } : undefined}
    >
      <Card className="border-0 rounded-none shadow-none py-0 gap-0">
        <CardHeader
          className={cn(
            'select-none py-2.5 px-3.5 gap-0 transition-colors [.border-b]:pb-2.5',
            isCollapsed ? 'bg-accent hover:bg-accent/70' : ''
          )}
          style={!isCollapsed ? { background: selectedTeam.primaryColor } : undefined}
        >
          <div className="flex items-center justify-between">
            <CardTitle className={cn('text-[12.5px] font-semibold flex items-center gap-1.5', !isCollapsed && 'text-white')}>
              <Scale className="h-3.5 w-3.5" />
              Restricted Free Agency
              <span className={cn('font-medium', isCollapsed ? 'text-muted-foreground' : 'text-white/75')}>
                {count}
              </span>
            </CardTitle>
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform duration-300',
                isCollapsed ? 'rotate-0 text-muted-foreground' : 'rotate-90 text-white/80'
              )}
            />
          </div>
        </CardHeader>
        <div
          className={`grid transition-all duration-300 ease-in-out ${isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="overflow-hidden">
            <CardContent className="space-y-4 pt-4 pb-4">
              <RestrictedFreeAgencyPanelContent />
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  )
}
