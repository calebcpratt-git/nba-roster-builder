'use client'

import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season } from '@/lib/types'
import { formatCurrency, formatCurrencyFull, CAP_THRESHOLDS } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, FileText, Check, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RosterTable() {
  const {
    roster,
    savedContracts,
    getEffectiveSalary,
    exercisedTeamOptions,
    declinedPlayerOptions,
    exerciseTeamOption,
    declineTeamOption,
    exercisePlayerOption,
    declinePlayerOption,
  } = useRoster()

  const allPlayers = [
    ...roster.map((p) => ({ ...p, source: 'current' as const })),
    ...savedContracts.map((c) => ({
      id: c.id,
      name: c.playerName,
      position: '-',
      jerseyNumber: 0,
      salary: c.salary,
      contractType: 'guaranteed' as const,
      isUserCreated: true,
      source: 'saved' as const,
      type: c.type,
    })),
  ]

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Roster & Contracts</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {roster.length} players
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 bg-muted/30 px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Player
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Pos
                </th>
                {SEASONS.map((season) => (
                  <th
                    key={season}
                    className="px-3 py-2 text-right text-xs font-medium text-muted-foreground min-w-[100px]"
                  >
                    {season}
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground w-10">
                  
                </th>
              </tr>
            </thead>
            <tbody>
              {allPlayers.map((player) => {
                const isCurrentRoster = player.source === 'current'
                const hasTeamOption = isCurrentRoster && 'teamOption' in player && player.teamOption
                const hasPlayerOption = isCurrentRoster && 'playerOption' in player && player.playerOption

                return (
                  <tr
                    key={player.id}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/20 transition-colors",
                      player.source === 'saved' && "bg-chart-2/5"
                    )}
                  >
                    <td className="sticky left-0 bg-card px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{player.name}</span>
                        {player.source === 'saved' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-chart-2 border-chart-2">
                            {'type' in player && player.type === 'extension' ? 'EXT' : 
                             'type' in player && player.type === 'trade' ? 'TRADE' : 'FA'}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">
                      {player.position}
                    </td>
                    {SEASONS.map((season) => {
                      const salary = isCurrentRoster
                        ? getEffectiveSalary(player as any, season)
                        : player.salary[season] || 0
                      const rawSalary = player.salary[season] || 0
                      
                      const isTeamOptionYear = hasTeamOption && player.teamOption === season
                      const isPlayerOptionYear = hasPlayerOption && player.playerOption === season
                      const isOptionExercised = isTeamOptionYear && exercisedTeamOptions.has(player.id)
                      const isPlayerOptionDeclined = isPlayerOptionYear && declinedPlayerOptions.has(player.id)

                      if (!rawSalary && !salary) {
                        return (
                          <td key={season} className="px-3 py-2.5 text-right">
                            <span className="text-xs text-muted-foreground/30">—</span>
                          </td>
                        )
                      }

                      return (
                        <td key={season} className="px-3 py-2.5 text-right">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center gap-1">
                                  <span
                                    className={cn(
                                      "text-sm font-mono",
                                      salary === 0 && rawSalary > 0
                                        ? "text-muted-foreground/50 line-through"
                                        : player.source === 'saved'
                                        ? "text-chart-2"
                                        : "text-foreground"
                                    )}
                                  >
                                    {formatCurrency(salary || rawSalary)}
                                  </span>
                                  {(isTeamOptionYear || isPlayerOptionYear) && (
                                    <span
                                      className={cn(
                                        "text-[9px] px-1 rounded font-medium",
                                        isTeamOptionYear
                                          ? isOptionExercised
                                            ? "bg-primary/20 text-primary"
                                            : "bg-warning/20 text-warning"
                                          : isPlayerOptionDeclined
                                          ? "bg-muted text-muted-foreground"
                                          : "bg-chart-2/20 text-chart-2"
                                      )}
                                    >
                                      {isTeamOptionYear ? 'TO' : 'PO'}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="font-mono text-xs">{formatCurrencyFull(rawSalary)}</p>
                                {isTeamOptionYear && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Team Option {isOptionExercised ? '(Exercised)' : '(Not Exercised)'}
                                  </p>
                                )}
                                {isPlayerOptionYear && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Player Option {isPlayerOptionDeclined ? '(Declined)' : '(Expected to Exercise)'}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      )
                    })}
                    <td className="px-2 py-2.5 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isCurrentRoster && (
                            <DropdownMenuItem>
                              <FileText className="h-4 w-4 mr-2" />
                              Create Extension
                            </DropdownMenuItem>
                          )}
                          {hasTeamOption && (
                            <>
                              {exercisedTeamOptions.has(player.id) ? (
                                <DropdownMenuItem onClick={() => declineTeamOption(player.id)}>
                                  <X className="h-4 w-4 mr-2" />
                                  Decline Team Option
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => exerciseTeamOption(player.id)}>
                                  <Check className="h-4 w-4 mr-2" />
                                  Exercise Team Option
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          {hasPlayerOption && (
                            <>
                              {declinedPlayerOptions.has(player.id) ? (
                                <DropdownMenuItem onClick={() => exercisePlayerOption(player.id)}>
                                  <Check className="h-4 w-4 mr-2" />
                                  Player Exercises Option
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => declinePlayerOption(player.id)}>
                                  <X className="h-4 w-4 mr-2" />
                                  Player Declines Option
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          <DropdownMenuItem>
                            <Info className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
