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

type CapStatus = 'Below Cap' | 'Over Cap' | 'Luxury Tax' | '1st Apron' | '2nd Apron'

function getCapStatus(total: number, thresholds: { type: string; value: number }[]): CapStatus {
  const secondApron = thresholds.find((t) => t.type === 'second-apron')?.value || 0
  const firstApron = thresholds.find((t) => t.type === 'first-apron')?.value || 0
  const luxuryTax = thresholds.find((t) => t.type === 'luxury-tax')?.value || 0
  const softCap = thresholds.find((t) => t.type === 'soft-cap')?.value || 0

  if (total >= secondApron) return '2nd Apron'
  if (total >= firstApron) return '1st Apron'
  if (total >= luxuryTax) return 'Luxury Tax'
  if (total >= softCap) return 'Over Cap'
  return 'Below Cap'
}

function getCapStatusColor(status: CapStatus): string {
  switch (status) {
    case '2nd Apron':
      return 'text-red-500 bg-red-500/10'
    case '1st Apron':
      return 'text-orange-500 bg-orange-500/10'
    case 'Luxury Tax':
      return 'text-amber-500 bg-amber-500/10'
    case 'Over Cap':
      return 'text-yellow-500 bg-yellow-500/10'
    case 'Below Cap':
      return 'text-emerald-500 bg-emerald-500/10'
  }
}

export function RosterTable() {
  const {
    roster,
    savedContracts,
    getEffectiveSalary,
    getTotalSalary,
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

  const projections = SEASONS.map((season) => {
    const { current, saved, total } = getTotalSalary(season)
    const thresholds = CAP_THRESHOLDS[season]
    const status = getCapStatus(total, thresholds)
    
    return {
      season,
      current,
      saved,
      total,
      thresholds,
      status,
    }
  })

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-base font-medium">Roster & Contracts</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {roster.length} players
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
              <span className="text-muted-foreground">Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-chart-2" />
              <span className="text-muted-foreground">Saved</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 bg-muted/30 px-4 py-2 text-left text-xs font-medium text-muted-foreground w-[180px]">
                  Player
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[40px]">
                  Pos
                </th>
                {SEASONS.map((season) => (
                  <th
                    key={season}
                    className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-[120px]"
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
              
              {/* Total Row */}
              <tr className="border-b border-border bg-muted/20">
                <td className="sticky left-0 bg-muted/20 px-4 py-2.5">
                  <span className="font-semibold text-sm">Total Salary</span>
                </td>
                <td className="px-2 py-2.5"></td>
                {SEASONS.map((season) => {
                  const proj = projections.find((p) => p.season === season)!
                  return (
                    <td key={season} className="px-3 py-2.5 text-right">
                      <span className="text-sm font-mono font-semibold">{formatCurrency(proj.total)}</span>
                    </td>
                  )
                })}
                <td className="px-2 py-2.5"></td>
              </tr>

              {/* Cap Status Row */}
              <tr className="bg-muted/10">
                <td className="sticky left-0 bg-muted/10 px-4 py-3">
                  <span className="text-xs text-muted-foreground font-medium">Cap Status</span>
                </td>
                <td className="px-2 py-3"></td>
                {SEASONS.map((season) => {
                  const proj = projections.find((p) => p.season === season)!
                  const statusColor = getCapStatusColor(proj.status)

                  return (
                    <td key={season} className="px-3 py-3 text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "text-xs font-semibold px-2 py-1 rounded-md cursor-default",
                                statusColor
                              )}
                            >
                              {proj.status}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[220px]">
                            <p className="text-sm font-semibold mb-2">{proj.season}</p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Salary:</span>
                                <span className="font-mono">{formatCurrencyFull(proj.total)}</span>
                              </div>
                              {proj.thresholds.map((t) => (
                                <div key={t.type} className="flex justify-between">
                                  <span className="text-muted-foreground">{t.label}:</span>
                                  <span className="font-mono">{formatCurrencyFull(t.value)}</span>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                  )
                })}
                <td className="px-2 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
