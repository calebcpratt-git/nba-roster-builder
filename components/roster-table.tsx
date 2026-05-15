'use client'

import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season, Player } from '@/lib/types'
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
    toggleTeamOption,
    togglePlayerOption,
    isOptionExercised,
  } = useRoster()

  const allPlayers = [
    ...roster.map((p) => ({ ...p, source: 'current' as const })),
    ...savedContracts.map((c) => ({
      id: c.id,
      name: c.playerName,
      team: '',
      salary: c.salary,
      options: {} as Partial<Record<Season, 'Player' | 'Team'>>,
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
                <th className="sticky left-0 bg-muted/30 px-4 py-2 text-left text-xs font-medium text-muted-foreground w-[200px]">
                  Player
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
                    {SEASONS.map((season) => {
                      const salary = isCurrentRoster
                        ? getEffectiveSalary(player as Player, season)
                        : player.salary[season] || 0
                      const rawSalary = player.salary[season] || 0
                      
                      const optionType = player.options[season]
                      const hasOption = !!optionType
                      const optionExercised = hasOption ? isOptionExercised(player.id, season, optionType) : null

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
                                  {hasOption && (
                                    <span
                                      className={cn(
                                        "text-[9px] px-1 rounded font-medium",
                                        optionType === 'Team'
                                          ? optionExercised === true
                                            ? "bg-primary/20 text-primary"
                                            : "bg-amber-500/20 text-amber-500"
                                          : "bg-sky-500/20 text-sky-500"
                                      )}
                                    >
                                      {optionType === 'Team' ? 'TO' : 'PO'}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="font-mono text-xs">{formatCurrencyFull(rawSalary)}</p>
                                {hasOption && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {optionType === 'Team' ? 'Team Option' : 'Player Option'}
                                    {optionType === 'Team' && (
                                      <span> {optionExercised === true ? '(Exercised)' : '(Not Exercised)'}</span>
                                    )}
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
                          {isCurrentRoster && SEASONS.map((season) => {
                            const optionType = player.options[season]
                            if (!optionType) return null
                            
                            const exercised = isOptionExercised(player.id, season, optionType)
                            
                            if (optionType === 'Team') {
                              return exercised === true ? (
                                <DropdownMenuItem key={season} onClick={() => toggleTeamOption(player.id, season, false)}>
                                  <X className="h-4 w-4 mr-2" />
                                  Decline {season} Team Option
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem key={season} onClick={() => toggleTeamOption(player.id, season, true)}>
                                  <Check className="h-4 w-4 mr-2" />
                                  Exercise {season} Team Option
                                </DropdownMenuItem>
                              )
                            }
                            
                            return (
                              <DropdownMenuItem key={season} onClick={() => togglePlayerOption(player.id, season, exercised !== true)}>
                                {exercised !== true ? <X className="h-4 w-4 mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                                {exercised !== true ? `Player Declines ${season} Option` : `Player Exercises ${season} Option`}
                              </DropdownMenuItem>
                            )
                          })}
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
              <tr className="border-t-2 border-border bg-muted/40">
                <td className="sticky left-0 bg-muted/40 px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Salary</span>
                </td>
                {SEASONS.map((season) => {
                  const proj = projections.find((p) => p.season === season)!
                  return (
                    <td key={season} className="px-3 py-3 text-right">
                      <span className="text-sm font-mono font-bold">{formatCurrency(proj.total)}</span>
                    </td>
                  )
                })}
                <td className="px-2 py-3"></td>
              </tr>

              {/* Cap Status Row */}
              <tr className="bg-muted/40">
                <td className="sticky left-0 bg-muted/40 px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cap Status</span>
                </td>
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
                                "text-xs font-bold px-2.5 py-1 rounded cursor-default",
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
                                  <span className="text-muted-foreground">{t.name}:</span>
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
