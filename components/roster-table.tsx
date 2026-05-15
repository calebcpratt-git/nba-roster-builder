'use client'

import { useState } from 'react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExtensionModal, ExtendButton } from '@/components/extension-modal'
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
  onExtend,
}: { 
  playerId: string
  optionType: 'Team' | 'Player'
  isExercised: boolean
  onToggle: (exercise: boolean) => void
  season: Season
  salary: number
  isSaved: boolean
  player: Player
  onExtend: (player: Player) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  
  const label = optionType === 'Team' ? 'TO' : 'PO'
  const isDeclined = !isExercised
  
  // TO badge is yellow/amber, PO badge is blue
  const optionTextColorClass = optionType === 'Team' 
    ? 'text-amber-400' 
    : 'text-sky-400'
  
  const optionBgClass = optionType === 'Team'
    ? 'bg-amber-500/20 hover:bg-amber-500/30'
    : 'bg-sky-500/20 hover:bg-sky-500/30'

  // Salary number uses the red > yellow > green gradient
  const salaryColorClass = getSalaryColor(salary)

  return (
    <Popover open={isOpen || isHovering} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-muted/50"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onClick={() => setIsOpen(true)}
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
          {isDeclined && !isSaved && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExtend(player)
              }}
              className="text-emerald-500 hover:text-emerald-600 transition-colors"
              title="Extend player"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
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
  } = useRoster()

  const [extensionModal, setExtensionModal] = useState<{ player: Player | null; isOpen: boolean }>({
    player: null,
    isOpen: false,
  })

  const allPlayers = [
    ...roster.map((p) => ({ ...p, source: 'current' as const })),
    ...savedContracts
      .filter((c) => c.type !== 'extension') // Don't show extensions as separate rows
      .map((c) => ({
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
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="sticky left-0 bg-muted/30 px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground w-[160px]">
                    Player
                  </th>
                  {SEASONS.map((season) => (
                    <th
                      key={season}
                      className="px-2 py-1.5 text-right text-[11px] font-medium text-muted-foreground w-[95px]"
                    >
                      {season}
                    </th>
                  ))}
                  <th className="px-1 py-1.5 text-center text-[11px] font-medium text-muted-foreground w-8">
                    
                  </th>
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
                        player.source === 'saved' && "bg-chart-2/5"
                      )}
                    >
                      <td className="sticky left-0 bg-card px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[12px]">{player.name}</span>
                          {player.source === 'saved' && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 text-chart-2 border-chart-2">
                              {'type' in player && player.type === 'extension' ? 'EXT' : 
                               'type' in player && player.type === 'trade' ? 'TRADE' : 'FA'}
                            </Badge>
                          )}
                        </div>
                      </td>
                      {SEASONS.map((season, index) => {
                        // For display, always use the original salary value
                        const displaySalary = player.salary[season] || 0
                        // For cap calculations, use the effective salary (which returns 0 for declined options)
                        const effectiveSalary = player.source === 'current' 
                          ? getEffectiveSalary(player as Player, season)
                          : displaySalary
                        
                        const optionType = player.options[season]
                        const hasOption = !!optionType
                        const optionExercised = hasOption ? isOptionExercised(player.id, season, optionType) : true
                        
                        // Check if this is the first empty season: no salary in current season, and all future seasons are empty
                        const hasSalaryInPreviousSeason = index > 0 && (player.salary[SEASONS[index - 1]] || 0) > 0
                        const isFirstEmptySeason = isRosterPlayer && !displaySalary && hasSalaryInPreviousSeason && SEASONS.slice(index).every((s) => !player.salary[s])

                        if (!displaySalary) {
                          return (
                            <td key={season} className="px-2 py-1.5 text-right">
                              {isFirstEmptySeason ? (
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

                        // If there's an option, use the combined component
                        if (hasOption) {
                          return (
                            <td key={season} className="px-2 py-1.5 text-right">
                              <OptionSalaryCell
                                playerId={player.id}
                                optionType={optionType}
                                isExercised={optionExercised}
                                season={season}
                                salary={displaySalary}
                                isSaved={player.source === 'saved'}
                                player={player as Player}
                                onExtend={(p) => setExtensionModal({ player: p, isOpen: true })}
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
                                  player.source === 'saved'
                                    ? "text-chart-2"
                                    : getSalaryColor(displaySalary)
                                )}
                              >
                                {formatCurrency(displaySalary)}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-1 py-1.5 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isCurrentRoster && (
                              <DropdownMenuItem>
                                <FileText className="h-4 w-4 mr-2" />
                                Create Extension
                              </DropdownMenuItem>
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
                <tr className="border-t-2 border-border bg-muted/40">
                  <td className="sticky left-0 bg-muted/40 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Salary</span>
                  </td>
                  {SEASONS.map((season) => {
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
                <tr className="bg-muted/40">
                  <td className="sticky left-0 bg-muted/40 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cap Status</span>
                  </td>
                  {SEASONS.map((season) => {
                    const proj = projections.find((p) => p.season === season)!
                    return (
                      <td key={season} className="px-2 py-2 text-right">
                        <CapStatusCell proj={proj} />
                      </td>
                    )
                  })}
                  <td className="px-1 py-2"></td>
                </tr>
              </tbody>
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
