'use client'

import { useState, useMemo } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season, Player } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ExtensionModal, ExtendButton } from '@/components/extension-modal'
import { Check, X, Info, Plus } from 'lucide-react'
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

function getTotalSalaryColor(status: CapStatus): string {
  switch (status) {
    case '2nd Apron':
      return 'text-red-500'
    case '1st Apron':
      return 'text-orange-500'
    case 'Luxury Tax':
      return 'text-amber-500'
    case 'Over Cap':
      return 'text-yellow-500'
    case 'Below Cap':
      return 'text-emerald-500'
  }
}

// Get salary color on a red > yellow > green gradient based on salary amount
function getSalaryColor(salary: number): string {
  // Define salary ranges for the gradient
  // $50M+ = red, $30M-50M = orange, $15M-30M = amber/yellow, $5M-15M = lime, <$5M = green
  if (salary >= 50000000) return 'text-red-500'
  if (salary >= 35000000) return 'text-orange-500'
  if (salary >= 20000000) return 'text-amber-500'
  if (salary >= 10000000) return 'text-yellow-500'
  if (salary >= 5000000) return 'text-lime-500'
  return 'text-emerald-500'
}

function CapThresholdPopup({ season, total, thresholds }: { 
  season: string
  total: number 
  thresholds: { name: string; value: number; type: string }[] 
}) {
  const thresholdColors: Record<string, string> = {
    'soft-cap': 'text-emerald-500',
    'luxury-tax': 'text-amber-500',
    'first-apron': 'text-orange-500',
    'second-apron': 'text-red-500',
  }

  // Reverse order: Second Apron on top, Salary Cap at bottom
  const orderedThresholds = [...thresholds].sort((a, b) => b.value - a.value)

  return (
    <div className="w-[200px] p-3">
      <p className="text-xs font-semibold mb-2 text-muted-foreground">{season} Thresholds</p>
      <div className="space-y-1.5">
        {orderedThresholds.map((threshold) => (
          <div key={threshold.type} className="flex justify-between text-xs">
            <span className={thresholdColors[threshold.type]}>{threshold.name}</span>
            <span className={cn("font-mono tabular-nums", thresholdColors[threshold.type])}>
              {formatCurrency(threshold.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CapStatusCell({ proj }: { 
  proj: { 
    season: string
    total: number
    status: CapStatus
    thresholds: { name: string; value: number; type: string }[] 
  } 
}) {
  const [isHovering, setIsHovering] = useState(false)
  const statusColor = getCapStatusColor(proj.status)

  return (
    <Popover open={isHovering}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded cursor-default transition-colors",
            statusColor
          )}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {proj.status}
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align="center" 
        className="p-0"
        sideOffset={0}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <CapThresholdPopup 
          season={proj.season}
          total={proj.total} 
          thresholds={proj.thresholds} 
        />
      </PopoverContent>
    </Popover>
  )
}

function OptionSalaryCell({ 
  playerId,
  optionType, 
  isExercised, 
  onToggle,
  season,
  salary,
  isSaved,
  player,
  isFirstEmpty,
  onExtend,
  isOptionExercisedFn,
}: { 
  playerId: string
  optionType: 'Team' | 'Player'
  isExercised: boolean
  onToggle: (exercise: boolean) => void
  season: Season
  salary: number
  isSaved: boolean
  player: Player
  isFirstEmpty: boolean
  onExtend: (player: Player) => void
  isOptionExercisedFn: (playerId: string, season: Season, optionType: 'Team' | 'Player') => boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  
  const label = optionType === 'Team' ? 'TO' : 'PO'
  const isDeclined = !isExercised
  
  const optionTextColorClass = optionType === 'Team' 
    ? 'text-amber-400' 
    : 'text-sky-400'
  
  const optionBgClass = optionType === 'Team'
    ? 'bg-amber-500/20 hover:bg-amber-500/30'
    : 'bg-sky-500/20 hover:bg-sky-500/30'

  const salaryColorClass = getSalaryColor(salary)

  // For team options that are declined, check if there's an earlier declined team option
  const hasEarlierDeclinedTeamOption = optionType === 'Team' && isDeclined ? (() => {
    const seasonIndex = SEASONS.indexOf(season)
    return SEASONS.slice(0, seasonIndex).some(s => {
      const earlierOptionType = player.options[s]
      if (earlierOptionType === 'Team') {
        const isEarlierExercised = isOptionExercisedFn(player.id, s, 'Team')
        return !isEarlierExercised
      }
      return false
    })
  })() : false

  return (
    <div className="inline-flex items-center gap-1">
      <Popover open={!hasEarlierDeclinedTeamOption && (isOpen || isHovering)} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-1 -mx-1 transition-colors",
              hasEarlierDeclinedTeamOption
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-muted/50"
            )}
            onMouseEnter={() => !hasEarlierDeclinedTeamOption && setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={() => !hasEarlierDeclinedTeamOption && setIsOpen(true)}
            disabled={hasEarlierDeclinedTeamOption}
          >
            <span
              className={cn(
                "text-[8px] px-0.5 rounded font-semibold",
                isDeclined
                  ? "bg-muted text-muted-foreground line-through"
                  : optionBgClass,
                !isDeclined && optionTextColorClass
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                "text-[12px] font-mono tabular-nums",
                isDeclined
                  ? "text-muted-foreground/50 line-through"
                  : isSaved
                  ? "text-chart-2"
                  : salaryColorClass
              )}
            >
              {formatCurrency(salary)}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-48 p-2" 
          side="top" 
          align="center"
          sideOffset={0}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => {
            setIsHovering(false)
          }}
          onInteractOutside={() => {
            setIsOpen(false)
            setIsHovering(false)
          }}
        >
          <p className="text-xs font-medium mb-2">
            {season} {optionType === 'Team' ? 'Team Option' : 'Player Option'}
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={isExercised ? "default" : "outline"}
              className="flex-1 h-7 text-xs"
              disabled={isExercised}
              onClick={() => {
                onToggle(true)
                setIsOpen(false)
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              Exercise
            </Button>
            <Button
              size="sm"
              variant={!isExercised ? "destructive" : "outline"}
              className="flex-1 h-7 text-xs"
              disabled={!isExercised}
              onClick={() => {
                onToggle(false)
                setIsOpen(false)
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Decline
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {isDeclined && !isSaved && isFirstEmpty && (
        <button
          onClick={() => onExtend(player)}
          className="text-emerald-500 hover:text-emerald-600 transition-colors"
          title="Extend player"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function RosterTable() {
  const {
    roster,
    savedContracts,
    getEffectiveSalary,
    getDisplaySalary,
    getTotalSalary,
    toggleTeamOption,
    togglePlayerOption,
    isOptionExercised,
    deletedContractIds,
  } = useRoster()

  const [extensionModal, setExtensionModal] = useState<{ player: Player | null; isOpen: boolean }>({
    player: null,
    isOpen: false,
  })

  // Calculate dynamic seasons based on roster and saved contracts
  const displayedSeasons = useMemo(() => {
    let maxSeasonIndex = 0 // Default to just 2025-26
    
    // Check roster players for latest contract year
    roster.forEach((player) => {
      SEASONS.forEach((season, index) => {
        if (player.salary[season] && player.salary[season]! > 0) {
          maxSeasonIndex = Math.max(maxSeasonIndex, index)
        }
      })
    })
    
    // Check saved contracts for latest contract year
    savedContracts.forEach((contract) => {
      if (deletedContractIds.has(contract.id)) return
      SEASONS.forEach((season, index) => {
        if (contract.salary[season] && contract.salary[season]! > 0) {
          maxSeasonIndex = Math.max(maxSeasonIndex, index)
        }
      })
    })
    
    return SEASONS.slice(0, maxSeasonIndex + 1)
  }, [roster, savedContracts, deletedContractIds])

  const allPlayers = [
    ...roster.map((p) => ({ ...p, source: 'current' as const })),
    ...savedContracts
      .filter((c) => c.type === 'free-agent' && !deletedContractIds.has(c.id)) // Only show non-deleted free agent signings as separate rows
      .map((c) => {
        // Get first year salary for sorting purposes
        const firstYearSalary = SEASONS.reduce((first, season) => {
          if (first === 0 && c.salary[season] > 0) return c.salary[season]
          return first
        }, 0)
        return {
          id: c.id,
          name: c.playerName,
          team: '',
          salary: c.salary,
          options: {} as Partial<Record<Season, 'Player' | 'Team'>>,
          isUserCreated: true,
          source: 'saved' as const,
          type: c.type,
          sortSalary: firstYearSalary, // Used for sorting
        }
      }),
  ].sort((a, b) => {
    // Sort by 25-26 salary for current players, or sortSalary for free agent signings
    const aSalary = 'sortSalary' in a ? a.sortSalary : (a.salary['2025-26'] || 0)
    const bSalary = 'sortSalary' in b ? b.sortSalary : (b.salary['2025-26'] || 0)
    return bSalary - aSalary
  })

  const projections = displayedSeasons.map((season) => {
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
    <>
      <Card className="bg-card border-border text-[13px]">
        <CardHeader className="pb-2 px-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm font-medium">Roster & Contracts</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {roster.length} players
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-sm bg-primary" />
                <span className="text-muted-foreground">Current</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-sm bg-chart-2" />
                <span className="text-muted-foreground">Saved</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex flex-col h-[calc(100vh-200px)]">
          <div className="overflow-x-auto flex-1 overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="sticky left-0 bg-muted/30 px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground w-[160px]">
                    Player
                  </th>
                  {displayedSeasons.map((season) => (
                    <th
                      key={season}
                      className="px-2 py-1.5 text-right text-[11px] font-medium text-muted-foreground w-[95px]"
                    >
                      {season}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPlayers.map((player) => {
                  const isCurrentRoster = player.source === 'current'
                  const isRosterPlayer = 'isUserCreated' in player ? !player.isUserCreated : true

                  return (
                    <tr
                      key={player.id}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/20 transition-colors",
                        player.source === 'saved' && 'type' in player && player.type === 'free-agent' && "bg-sky-500/10"
                      )}
                    >
                      <td className={cn(
                        "sticky left-0 px-3 py-1.5",
                        player.source === 'saved' && 'type' in player && player.type === 'free-agent' 
                          ? "bg-sky-500/10" 
                          : "bg-card"
                      )}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[12px]">
                            {player.name}
                          </span>
                          {player.source === 'saved' && (
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[9px] px-1 py-0",
                                'type' in player && player.type === 'free-agent' 
                                  ? "text-sky-400 border-sky-400" 
                                  : "text-chart-2 border-chart-2"
                              )}
                            >
                              {'type' in player && player.type === 'extension' ? 'EXT' : 
                               'type' in player && player.type === 'trade' ? 'TRADE' : 'FA'}
                            </Badge>
                          )}
                        </div>
                      </td>
                      {displayedSeasons.map((season, index) => {
                        // Raw salary — used to decide whether a cell has a contract at all
                        const rawSalary = player.salary[season] || 0
                        // Display salary — for current roster players, merges in any saved extension salaries
                        // This intentionally uses the raw value for option years so we can still show
                        // the crossed-out number; getEffectiveSalary is only used for cap totals.
                        const extensionSalary = player.source === 'current'
                          ? (() => {
                              const ext = savedContracts.find(
                                c => c.type === 'extension' && c.playerId === player.id && !deletedContractIds.has(c.id)
                              )
                              return ext?.salary[season] || 0
                            })()
                          : 0
                        const displaySalary = rawSalary || extensionSalary

                        const optionType = player.options[season]
                        const hasOption = !!optionType
                        const optionExercised = hasOption ? isOptionExercised(player.id, season, optionType) : true

                        // Find the first season with no effective contract (declined options count as empty for extension purposes)
                        const firstEmptySeasonIndex = SEASONS.findIndex(s => {
                          const effectiveSal = player.source === 'current'
                            ? getEffectiveSalary(player as Player, s)
                            : (player.salary[s] || 0)
                          const hasExt = savedContracts.some(
                            c => c.type === 'extension' && c.playerId === player.id && !deletedContractIds.has(c.id) && c.salary[s]
                          )
                          return effectiveSal === 0 && !hasExt
                        })

                        // Only show extend button on the first empty season
                        const shouldShowExtendButton = isRosterPlayer && firstEmptySeasonIndex === index && firstEmptySeasonIndex !== -1

                        if (!displaySalary) {
                          return (
                            <td key={season} className="px-2 py-1.5 text-right">
                              {shouldShowExtendButton ? (
                                <ExtendButton
                                  player={player as Player}
                                  onOpenModal={(p) => setExtensionModal({ player: p, isOpen: true })}
                                />
                              ) : (
                                <span className="text-[10px] text-muted-foreground/30">—</span>
                              )}
                            </td>
                          )
                        }

                        // If there's an option, use the combined component (always show; OptionSalaryCell handles strikethrough)
                        if (hasOption) {
                          return (
                            <td key={season} className="px-2 py-1.5 text-right">
                              <OptionSalaryCell
                                playerId={player.id}
                                optionType={optionType}
                                isExercised={optionExercised}
                                season={season}
                                salary={rawSalary}
                                isSaved={player.source === 'saved'}
                                player={player as Player}
                                isFirstEmpty={shouldShowExtendButton}
                                onExtend={(p) => setExtensionModal({ player: p, isOpen: true })}
                                isOptionExercisedFn={isOptionExercised}
                                onToggle={(exercise) => {
                                  if (optionType === 'Team') {
                                    toggleTeamOption(player.id, season, exercise)
                                  } else {
                                    togglePlayerOption(player.id, season, exercise)
                                  }
                                }}
                              />
                            </td>
                          )
                        }

                        // Regular salary without option - use gradient color
                        // Check if this salary is from an extension
                        const isExtensionSalary = player.source === 'current' && 
                          savedContracts.some(c => c.type === 'extension' && c.playerId === player.id && c.salary[season])
                        
                        return (
                          <td key={season} className="px-2 py-1.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              {isExtensionSalary && (
                                <span className="text-[8px] px-0.5 rounded font-semibold bg-purple-500/20 text-purple-400">
                                  EXT
                                </span>
                              )}
                              <span
                                className={cn(
                                  "text-[12px] font-mono tabular-nums",
                                  getSalaryColor(displaySalary)
                                )}
                              >
                                {formatCurrency(displaySalary)}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                
              </tbody>

              <tfoot className="sticky bottom-0 bg-muted">
                {/* Total Row */}
                <tr className="border-t-2 border-border">
                  <td className="sticky left-0 bg-muted px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Salary</span>
                  </td>
                  {displayedSeasons.map((season) => {
                    const proj = projections.find((p) => p.season === season)!
                    const totalColor = getTotalSalaryColor(proj.status)
                    return (
                      <td key={season} className="px-2 py-2 text-right">
                        <span className={cn("text-[12px] font-mono font-bold tabular-nums", totalColor)}>
                          {formatCurrency(proj.total)}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-1 py-2"></td>
                </tr>

                {/* Cap Status Row */}
                <tr className="">
                  <td className="sticky left-0 bg-muted/40 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cap Status</span>
                  </td>
                  {displayedSeasons.map((season) => {
                    const proj = projections.find((p) => p.season === season)!
                    return (
                      <td key={season} className="px-2 py-2 text-right">
                        <CapStatusCell proj={proj} />
                      </td>
                    )
                  })}
                  <td className="px-1 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <ExtensionModal
        player={extensionModal.player}
        isOpen={extensionModal.isOpen}
        onClose={() => setExtensionModal({ player: null, isOpen: false })}
      />
    </>
  )
}
