'use client'

import { useState, useMemo } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season, Player, CapStatus, SavedContract } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS, getCapStatus, getCapStatusColor, getTotalSalaryColor } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { DraftPickHoverContent } from '@/components/draft-pick-hover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ExtensionModal, ExtendButton } from '@/components/extension-modal'
import { SignFreeAgentModal } from '@/components/sign-free-agent-modal'
import { SaveCapSheetButton } from '@/components/save-cap-sheet-modal'
import { getDisplayedSeasons } from '@/lib/contract-utils'
import { Check, X, Info, Plus, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  onExtend: (player: Player, season: Season) => void
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
          onClick={() => onExtend(player, season)}
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
    draftPickPlayers,
    pickNumberOverrides,
    setPickNumberOverride,
    releasedRosterIds,
    releaseRosterPlayer,
    restoreRosterPlayer,
    savedTrades,
    tradedRosterPlayerIds,
    tradedPickIds,
  } = useRoster()

  const [extensionModal, setExtensionModal] = useState<{ player: Player | null; isOpen: boolean; startSeason?: Season }>({
    player: null,
    isOpen: false,
  })

  const [editContractModal, setEditContractModal] = useState<{ contract: SavedContract | null; player: Player | null; isOpen: boolean }>({
    contract: null,
    player: null,
    isOpen: false,
  })

  // Calculate dynamic seasons based on roster and saved contracts
  const displayedSeasons = useMemo(
    () => getDisplayedSeasons(roster, savedContracts, deletedContractIds, draftPickPlayers, savedTrades),
    [roster, savedContracts, deletedContractIds, draftPickPlayers, savedTrades]
  )

  const allPlayers = [
    ...roster.map((p) => {
      // Use extension salary for 26-27 if one exists (covers new signings and declined-option re-signs),
      // otherwise fall back to effective salary (returns 0 for declined options).
      const extension = savedContracts.find(
        c => c.type === 'extension' && c.playerId === p.id && !deletedContractIds.has(c.id)
      )
      const sortSalary = extension?.salary['2026-27'] || getEffectiveSalary(p, '2026-27')
      return { ...p, source: 'current' as const, sortSalary, isTraded: tradedRosterPlayerIds.has(p.id) }
    }),
    ...savedContracts
      .filter((c) => (c.type === 'free-agent') && !deletedContractIds.has(c.id))
      .map((c) => {
        const firstYearSalary = SEASONS.reduce<number>((first, season) => {
          if (first === 0 && c.salary[season]) return c.salary[season]!
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
          sortSalary: firstYearSalary,
          isMinimum: c.isMinimum || false,
          isTraded: tradedRosterPlayerIds.has(c.id),
        }
      }),
    // Incoming trade players
    ...savedTrades.flatMap((trade) =>
      trade.incomingPlayers.map((p) => {
        const firstYearSalary = SEASONS.reduce<number>((first, season) => {
          if (first === 0 && p.salary[season]) return p.salary[season]!
          return first
        }, 0)
        return {
          id: `${trade.id}-player-${p.playerId}`,
          name: p.playerName,
          team: trade.tradeTeamAbbr,
          salary: p.salary,
          options: p.options,
          isUserCreated: true,
          source: 'trade-incoming' as const,
          type: 'trade' as const,
          sortSalary: firstYearSalary,
          isMinimum: false,
          isTraded: false,
        }
      })
    ),
  ].sort((a, b) => b.sortSalary - a.sortSalary)

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
              <SaveCapSheetButton />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex flex-col h-[calc(100vh-200px)]">
          <div className="overflow-x-auto flex-1 overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="sticky left-0 bg-muted/30 px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground w-[220px]">
                    Player
                  </th>
                  {displayedSeasons.map((season) => (
                    <th
                      key={season}
                      className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground w-[95px]"
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
                  const isReleasable = player.source === 'current'
                  const isReleased = isReleasable && releasedRosterIds.has(player.id)
                  const isTraded = 'isTraded' in player && player.isTraded
                  const isTradeIncoming = player.source === 'trade-incoming'

                  return (
                    <tr
                      key={player.id}
                      className={cn(
                        "group border-b border-border/50 hover:bg-muted/20 transition-colors",
                        player.source === 'saved' && 'type' in player && player.type === 'free-agent' && "bg-sky-500/10",
                        isTradeIncoming && "bg-chart-4/5",
                        (isReleased || isTraded) && "opacity-40"
                      )}
                    >
                      <td className={cn(
                        "sticky left-0 px-3 py-1.5",
                        player.source === 'saved' && 'type' in player && player.type === 'free-agent'
                          ? "bg-sky-500/10"
                          : isTradeIncoming
                          ? "bg-chart-4/5"
                          : "bg-card"
                      )}>
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "font-medium text-[12px] whitespace-nowrap",
                            (isReleased || isTraded) && "line-through text-muted-foreground"
                          )}>
                            {player.name}
                          </span>
                          {(player.source === 'saved' || isTradeIncoming) && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] px-1 py-0",
                                isTradeIncoming
                                  ? "text-chart-4 border-chart-4"
                                  : 'type' in player && player.type === 'free-agent'
                                  ? "text-sky-400 border-sky-400"
                                  : "text-chart-2 border-chart-2"
                              )}
                            >
                              {isTradeIncoming ? 'TRADE' :
                               'type' in player && player.type === 'extension' ? 'EXT' :
                               'type' in player && player.type === 'trade' ? 'TRADE' : 'FA'}
                            </Badge>
                          )}
                          {isTraded && (
                            <span className="text-[9px] font-semibold text-chart-4/70 tracking-wide">TRADED</span>
                          )}
                          {isReleasable && !isReleased && !isTraded && (
                            <button
                              onClick={() => releaseRosterPlayer(player.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-[9px] font-semibold text-muted-foreground/50 hover:text-red-500 tracking-wide"
                            >
                              RELEASE
                            </button>
                          )}
                          {isReleased && (
                            <button
                              onClick={() => restoreRosterPlayer(player.id)}
                              className="ml-0.5 text-muted-foreground hover:text-emerald-500 transition-colors"
                              title="Restore Player"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      {displayedSeasons.map((season, index) => {
                        // Raw salary — used to decide whether a cell has a contract at all
                        const rawSalary = player.salary[season] || 0
                        // Display salary — for current roster players, merges in any saved extension salaries
                        // This intentionally uses the raw value for option years so we can still show
                        // the crossed-out number; getEffectiveSalary is only used for cap totals.
                        const extensionSalary = (player.source === 'current' || player.source === 'trade-incoming')
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
                        const optionExercised = hasOption ? (isOptionExercised(player.id, season, optionType) ?? true) : true

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

                        // Only show extend button on the first empty season (not for released players)
                        const shouldShowExtendButton = (isRosterPlayer || isTradeIncoming) && !isReleased && firstEmptySeasonIndex === index && firstEmptySeasonIndex !== -1

                        if (!displaySalary) {
                          return (
                            <td key={season} className="px-2 py-1.5">
                              {shouldShowExtendButton ? (
                                <div className="flex justify-center">
                                  <ExtendButton
                                    player={player as Player}
                                    onOpenModal={(p) => setExtensionModal({ player: p, isOpen: true, startSeason: season })}
                                  />
                                </div>
                              ) : (
                                <div className="flex justify-center">
                                  <span className="text-[10px] text-muted-foreground/30">—</span>
                                </div>
                              )}
                            </td>
                          )
                        }

                        // If there's an option, use the combined component (always show; OptionSalaryCell handles strikethrough)
                        if (hasOption) {
                          return (
                            <td key={season} className="px-2 py-1.5 text-left">
                              <OptionSalaryCell
                                playerId={player.id}
                                optionType={optionType}
                                isExercised={optionExercised}
                                season={season}
                                salary={rawSalary}
                                isSaved={player.source === 'saved'}
                                player={player as Player}
                                isFirstEmpty={shouldShowExtendButton}
                                onExtend={(p, s) => setExtensionModal({ player: p, isOpen: true, startSeason: s })}
                                isOptionExercisedFn={(id, s, t) => isOptionExercised(id, s, t) ?? true}
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
                        // Check if this salary is from an extension or MLE contract
                        const extensionContract = (player.source === 'current' || player.source === 'trade-incoming')
                          ? savedContracts.find(
                              c => c.type === 'extension' && c.playerId === player.id && !deletedContractIds.has(c.id) && c.salary[season]
                            )
                          : undefined
                        const savedFAContract = player.source === 'saved'
                          ? savedContracts.find(c => c.id === player.id && !deletedContractIds.has(c.id))
                          : undefined
                        const editableContract = extensionContract ?? savedFAContract
                        const isExtensionSalary = !!extensionContract
                        const isMLESalary = player.source === 'saved' && displaySalary > 0 &&
                          savedContracts.some(c => c.id === player.id && c.isMLE)

                        return (
                          <td key={season} className="px-2 py-1.5 text-left">
                            <div className="inline-flex items-center gap-1">
                              {editableContract ? (
                                <button
                                  onClick={() => setEditContractModal({ contract: editableContract, player: player as Player, isOpen: true })}
                                  className={cn(
                                    "text-[12px] font-mono tabular-nums rounded px-1 -mx-1 transition-colors hover:bg-muted/60 cursor-pointer",
                                    getSalaryColor(displaySalary)
                                  )}
                                  title={`Edit ${player.name}'s ${editableContract.type === 'extension' ? 'extension' : 'contract'}`}
                                >
                                  {formatCurrency(displaySalary)}
                                </button>
                              ) : (
                                <span
                                  className={cn(
                                    "text-[12px] font-mono tabular-nums",
                                    getSalaryColor(displaySalary)
                                  )}
                                >
                                  {formatCurrency(displaySalary)}
                                </span>
                              )}
                              {isExtensionSalary && (
                                <span className="text-[8px] px-0.5 rounded font-semibold bg-purple-500/20 text-purple-400">
                                  EXT
                                </span>
                              )}
                              {isMLESalary && (
                                <span className="text-[8px] px-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-400">
                                  MLE
                                </span>
                              )}
                            </div>
                      </td>
                    )
                  })}
                </tr>
                  )
                })}
                
                {/* Draft Picks section */}
                {draftPickPlayers.length > 0 && (
                  <tr className="border-t border-border bg-muted/40">
                    <td
                      colSpan={displayedSeasons.length + 1}
                      className="sticky left-0 bg-muted/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Draft Picks
                    </td>
                  </tr>
                )}
                {draftPickPlayers.map((pick) => (
                  <tr
                    key={pick.id}
                    className={cn(
                      "border-b border-border/30 hover:bg-muted/20 transition-colors",
                      tradedPickIds.has(pick.id) && "opacity-40"
                    )}
                  >
                    <td className={cn("sticky left-0 px-3 py-1.5", tradedPickIds.has(pick.id) ? "bg-card" : "bg-card")}>
                      {(() => {
                        const yearMatch = pick.name.match(/^(\d{4}) - 1st/)
                        const pickYear = yearMatch ? parseInt(yearMatch[1]) : 0
                        const isAdjustable = pickYear >= 2027 && !tradedPickIds.has(pick.id)
                        const currentOverride = pickNumberOverrides[pick.id] ?? null
                        const isPickTraded = tradedPickIds.has(pick.id)
                        return (
                          <div className="flex items-center gap-1.5">
                            <HoverCard openDelay={150}>
                              <HoverCardTrigger asChild>
                                <span
                                  className={cn(
                                    "text-[12px] font-medium text-muted-foreground whitespace-nowrap cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2",
                                    isPickTraded && "line-through"
                                  )}
                                >
                                  {pick.name}
                                </span>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-64 p-3 text-xs">
                                <DraftPickHoverContent dp={pick.draftPick} />
                              </HoverCardContent>
                            </HoverCard>
                            {isPickTraded && (
                              <span className="text-[9px] font-semibold text-chart-4/70 tracking-wide">TRADED</span>
                            )}
                            {isAdjustable && (
                              <Select
                                value={String(currentOverride ?? 16)}
                                onValueChange={(val) => setPickNumberOverride(pick.id, parseInt(val))}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="h-[18px] text-[10px] px-1.5 py-0 min-w-0 w-auto gap-0.5 border-border/50 text-muted-foreground"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="text-[11px] min-w-[64px]">
                                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                                    <SelectItem key={n} value={String(n)} className="text-[11px] py-1 pl-2 pr-6">
                                      #{n}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    {displayedSeasons.map((season) => {
                      const salary = pick.salary[season] || 0
                      const optionType = pick.options[season]
                      const hasOption = !!optionType
                      const optionExercised = hasOption ? (isOptionExercised(pick.id, season, optionType) ?? true) : true

                      if (!salary) {
                        return (
                          <td key={season} className="px-2 py-1.5">
                            <div className="flex justify-center">
                              <span className="text-[10px] text-muted-foreground/30">—</span>
                            </div>
                          </td>
                        )
                      }

                      if (hasOption) {
                        return (
                          <td key={season} className="px-2 py-1.5 text-left">
                            <OptionSalaryCell
                              playerId={pick.id}
                              optionType={optionType}
                              isExercised={optionExercised}
                              season={season}
                              salary={salary}
                              isSaved={false}
                              player={pick as Player}
                              isFirstEmpty={false}
                              onExtend={() => {}}
                              isOptionExercisedFn={(id, s, t) => isOptionExercised(id, s, t) ?? true}
                              onToggle={(exercise) => {
                                if (optionType === 'Team') {
                                  toggleTeamOption(pick.id, season, exercise)
                                } else {
                                  togglePlayerOption(pick.id, season, exercise)
                                }
                              }}
                            />
                          </td>
                        )
                      }

                      return (
                        <td key={season} className="px-2 py-1.5 text-left">
                          <span className={cn("text-[12px] font-mono tabular-nums", getSalaryColor(salary))}>
                            {formatCurrency(salary)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                
                {/* Incoming trade picks */}
                {savedTrades.flatMap((trade) => trade.incomingPicks).length > 0 &&
                  savedTrades.flatMap((trade) =>
                    trade.incomingPicks.map((pick) => (
                      <tr key={pick.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors bg-chart-4/5">
                        <td className="sticky left-0 bg-chart-4/5 px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap">{pick.name}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 text-chart-4 border-chart-4">TRADE</Badge>
                          </div>
                        </td>
                        {displayedSeasons.map((season) => {
                          const salary = pick.salary[season] || 0
                          const optionType = pick.options[season]
                          const hasOption = !!optionType
                          const optionExercised = hasOption ? (isOptionExercised(pick.id, season, optionType) ?? true) : true

                          if (!salary) {
                            return (
                              <td key={season} className="px-2 py-1.5">
                                <div className="flex justify-center">
                                  <span className="text-[10px] text-muted-foreground/30">—</span>
                                </div>
                              </td>
                            )
                          }

                          if (hasOption) {
                            return (
                              <td key={season} className="px-2 py-1.5 text-left">
                                <OptionSalaryCell
                                  playerId={pick.id}
                                  optionType={optionType}
                                  isExercised={optionExercised}
                                  season={season}
                                  salary={salary}
                                  isSaved={false}
                                  player={{ id: pick.id, name: pick.name, team: '', salary: pick.salary, options: pick.options }}
                                  isFirstEmpty={false}
                                  onExtend={() => {}}
                                  isOptionExercisedFn={(id, s, t) => isOptionExercised(id, s, t) ?? true}
                                  onToggle={(exercise) => {
                                    if (optionType === 'Team') {
                                      toggleTeamOption(pick.id, season, exercise)
                                    } else {
                                      togglePlayerOption(pick.id, season, exercise)
                                    }
                                  }}
                                />
                              </td>
                            )
                          }

                          return (
                            <td key={season} className="px-2 py-1.5 text-left">
                              <span className={cn("text-[12px] font-mono tabular-nums", getSalaryColor(salary))}>
                                {formatCurrency(salary)}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )
                }
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
                      <td key={season} className="px-2 py-2 text-left">
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
                  <td className="sticky left-0 bg-muted px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cap Status</span>
                  </td>
                  {displayedSeasons.map((season) => {
                    const proj = projections.find((p) => p.season === season)!
                    return (
                      <td key={season} className="px-2 py-2 text-left">
                        <CapStatusCell proj={proj} />
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <ExtensionModal
        player={extensionModal.player}
        isOpen={extensionModal.isOpen}
        startSeason={extensionModal.startSeason}
        onClose={() => setExtensionModal({ player: null, isOpen: false })}
      />

      {editContractModal.contract?.type === 'extension' ? (
        <ExtensionModal
          player={editContractModal.player}
          isOpen={editContractModal.isOpen}
          editingContract={editContractModal.contract}
          onClose={() => setEditContractModal({ contract: null, player: null, isOpen: false })}
        />
      ) : (
        <SignFreeAgentModal
          player={editContractModal.player}
          startingSeason={
            (editContractModal.contract
              ? SEASONS.find((s) => (editContractModal.contract!.salary[s] ?? 0) > 0)
              : undefined) ?? SEASONS[0]
          }
          isOpen={editContractModal.isOpen}
          editingContract={editContractModal.contract}
          onClose={() => setEditContractModal({ contract: null, player: null, isOpen: false })}
        />
      )}
    </>
  )
}
