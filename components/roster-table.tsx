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
import { MoreHorizontal, FileText, Check, X, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  // Calculate projections for the cap bars
  const projections = SEASONS.map((season) => {
    const { current, saved, total } = getTotalSalary(season)
    const thresholds = CAP_THRESHOLDS[season]
    const violations = thresholds.filter((t) => total > t.value)
    
    return {
      season,
      current,
      saved,
      total,
      thresholds,
      violations,
      softCap: thresholds.find((t) => t.type === 'soft-cap')?.value || 0,
      luxuryTax: thresholds.find((t) => t.type === 'luxury-tax')?.value || 0,
      firstApron: thresholds.find((t) => t.type === 'first-apron')?.value || 0,
      secondApron: thresholds.find((t) => t.type === 'second-apron')?.value || 0,
    }
  })

  const maxSalary = Math.max(
    ...projections.map((p) => p.total),
    ...projections.map((p) => p.secondApron)
  ) * 1.1

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
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-3 bg-muted-foreground/60 rounded-full" />
              <span className="text-muted-foreground">Cap</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-3 bg-warning rounded-full" />
              <span className="text-muted-foreground">Tax</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-3 bg-orange-500 rounded-full" />
              <span className="text-muted-foreground">1st</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-3 bg-destructive rounded-full" />
              <span className="text-muted-foreground">2nd</span>
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

              {/* Cap Projection Bar Row */}
              <tr className="bg-muted/10">
                <td className="sticky left-0 bg-muted/10 px-4 py-4">
                  <span className="text-xs text-muted-foreground font-medium">Cap Status</span>
                </td>
                <td className="px-2 py-4"></td>
                {SEASONS.map((season) => {
                  const proj = projections.find((p) => p.season === season)!
                  const currentHeight = (proj.current / maxSalary) * 100
                  const savedHeight = (proj.saved / maxSalary) * 100
                  const softCapLine = (proj.softCap / maxSalary) * 100
                  const taxLine = (proj.luxuryTax / maxSalary) * 100
                  const apron1Line = (proj.firstApron / maxSalary) * 100
                  const apron2Line = (proj.secondApron / maxSalary) * 100

                  const hasViolation = proj.violations.length > 0
                  const worstViolation = proj.violations[proj.violations.length - 1]

                  return (
                    <td key={season} className="px-3 py-4">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="relative h-[100px] mx-auto max-w-[80px] group cursor-pointer">
                              {/* Threshold markers */}
                              <div
                                className="absolute left-0 right-0 z-10 pointer-events-none"
                                style={{ bottom: `${softCapLine}%` }}
                              >
                                <div className="h-[2px] bg-muted-foreground/60 rounded-full" />
                              </div>
                              <div
                                className="absolute left-0 right-0 z-10 pointer-events-none"
                                style={{ bottom: `${taxLine}%` }}
                              >
                                <div className="h-[2px] bg-warning rounded-full" />
                              </div>
                              <div
                                className="absolute left-0 right-0 z-10 pointer-events-none"
                                style={{ bottom: `${apron1Line}%` }}
                              >
                                <div className="h-[2px] bg-orange-500 rounded-full" />
                              </div>
                              <div
                                className="absolute left-0 right-0 z-10 pointer-events-none"
                                style={{ bottom: `${apron2Line}%` }}
                              >
                                <div className="h-[2px] bg-destructive rounded-full" />
                              </div>

                              {/* Stacked bars */}
                              <div className="absolute bottom-0 left-1 right-1 flex flex-col">
                                {proj.saved > 0 && (
                                  <div
                                    className="w-full bg-chart-2 rounded-t transition-all group-hover:brightness-110"
                                    style={{ height: `${savedHeight}px` }}
                                  />
                                )}
                                <div
                                  className={cn(
                                    "w-full bg-primary transition-all group-hover:brightness-110",
                                    proj.saved === 0 && "rounded-t"
                                  )}
                                  style={{ height: `${currentHeight}px` }}
                                />
                              </div>

                              {/* Violation badge */}
                              {hasViolation && (
                                <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[9px] px-1 py-0 whitespace-nowrap border",
                                      worstViolation?.type === 'second-apron'
                                        ? "border-destructive text-destructive bg-destructive/10"
                                        : worstViolation?.type === 'first-apron'
                                        ? "border-orange-500 text-orange-500 bg-orange-500/10"
                                        : "border-warning text-warning bg-warning/10"
                                    )}
                                  >
                                    <AlertTriangle className="h-2 w-2 mr-0.5" />
                                    {worstViolation?.type === 'second-apron'
                                      ? '2nd'
                                      : worstViolation?.type === 'first-apron'
                                      ? '1st'
                                      : worstViolation?.type === 'luxury-tax'
                                      ? 'Tax'
                                      : 'Cap'}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[220px]">
                            <p className="text-sm font-semibold mb-2">{proj.season}</p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Salary:</span>
                                <span className="font-mono font-medium">{formatCurrencyFull(proj.total)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Current Roster:</span>
                                <span className="font-mono">{formatCurrencyFull(proj.current)}</span>
                              </div>
                              {proj.saved > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Saved Contracts:</span>
                                  <span className="font-mono text-chart-2">{formatCurrencyFull(proj.saved)}</span>
                                </div>
                              )}
                              <div className="border-t border-border mt-2 pt-2 space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Cap Space:</span>
                                  <span className={cn(
                                    "font-mono font-medium",
                                    proj.total > proj.softCap ? "text-destructive" : "text-emerald-500"
                                  )}>
                                    {proj.total > proj.softCap ? '-' : '+'}{formatCurrencyFull(Math.abs(proj.softCap - proj.total))}
                                  </span>
                                </div>
                              </div>
                              {proj.violations.length > 0 && (
                                <div className="border-t border-border mt-2 pt-2">
                                  <p className="text-muted-foreground mb-1">Exceeded:</p>
                                  {proj.violations.map((v) => (
                                    <div key={v.type} className="flex justify-between text-destructive">
                                      <span>{v.label}:</span>
                                      <span className="font-mono">+{formatCurrencyFull(proj.total - v.value)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                  )
                })}
                <td className="px-2 py-4"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
