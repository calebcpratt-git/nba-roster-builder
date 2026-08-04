'use client'

import { useState, useRef, useEffect } from 'react'
import { useRoster } from '@/lib/roster-context'
import { useRosterTableData } from '@/hooks/use-roster-table-data'
import { SEASONS, Season, Player, CapStatus, SavedContract } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS, getCapStatusColor, getTotalSalaryColor } from '@/lib/data'
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
import { Check, X, Info, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Get salary pill classes on a red > yellow > green gradient based on salary amount
// $50M+ = red, $30M-50M = orange, $15M-30M = amber/yellow, $5M-15M = lime, <$5M = green
export function getSalaryColor(salary: number): string {
  if (salary >= 50000000) return 'bg-red-500/15 text-red-600'
  if (salary >= 35000000) return 'bg-orange-500/15 text-orange-600'
  if (salary >= 20000000) return 'bg-amber-500/15 text-amber-700'
  if (salary >= 10000000) return 'bg-yellow-500/15 text-yellow-700'
  if (salary >= 5000000) return 'bg-lime-500/15 text-lime-700'
  return 'bg-emerald-500/15 text-emerald-700'
}

export const SALARY_PILL_BASE = "font-mono font-semibold text-[11.5px] tabular-nums px-[7px] py-[2px] rounded-[5px]"

// Season columns dynamically fill the available width so the last season the
// user cares most about (2029-30, index 3 => 4 columns) is always visible
// without horizontal scroll, on any window size. Never shrinks below the
// table's original fixed width, so narrow windows still scroll gracefully.
const PLAYER_COL_WIDTH = 185
const MIN_SEASON_COL_WIDTH = 108
const TARGET_LAST_VISIBLE_SEASON = '2029-30' as Season

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

export function TotalPayrollCell({ proj }: {
  proj: {
    season: string
    total: number
    status: CapStatus
    thresholds: { name: string; value: number; type: string }[]
  }
}) {
  const [isHovering, setIsHovering] = useState(false)
  const pillColor = getCapStatusColor(proj.status)
  const labelColor = getTotalSalaryColor(proj.status)

  return (
    <Popover open={isHovering}>
      <PopoverTrigger asChild>
        <button
          className="flex flex-col items-start gap-1 cursor-default"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <span className={cn("text-[12.5px] font-mono font-bold tabular-nums px-[7px] py-[2px] rounded-[5px]", pillColor)}>
            {formatCurrency(proj.total)}
          </span>
          <span className={cn("text-[9px] font-bold uppercase tracking-wide pl-px", labelColor)}>
            {proj.status}
          </span>
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

export function OptionSalaryCell({ 
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
    ? 'text-amber-700'
    : 'text-sky-700'

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
                isDeclined
                  ? "text-[12px] font-mono tabular-nums text-muted-foreground/50 line-through"
                  : isSaved
                  ? cn(SALARY_PILL_BASE, "bg-chart-2/15 text-chart-2")
                  : cn(SALARY_PILL_BASE, salaryColorClass)
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
              className="flex-1 min-w-0 shrink h-7 px-2 text-xs"
              disabled={isExercised}
              onClick={() => {
                onToggle(true)
                setIsOpen(false)
              }}
            >
              <Check className="h-3 w-3 mr-1 shrink-0" />
              Exercise
            </Button>
            <Button
              size="sm"
              variant={!isExercised ? "destructive" : "outline"}
              className="flex-1 min-w-0 shrink h-7 px-2 text-xs"
              disabled={!isExercised}
              onClick={() => {
                onToggle(false)
                setIsOpen(false)
              }}
            >
              <X className="h-3 w-3 mr-1 shrink-0" />
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

// A season cell with no contract on the books yet — either a dash, or (on the
// first such season) the "extend this player" affordance.
export function EmptyOrExtendCell({
  shouldShowExtendButton,
  player,
  season,
  onExtend,
}: {
  shouldShowExtendButton: boolean
  player: Player
  season: Season
  onExtend: (player: Player, season: Season) => void
}) {
  if (shouldShowExtendButton) {
    return (
      <div className="flex justify-center">
        <ExtendButton player={player} onOpenModal={(p) => onExtend(p, season)} />
      </div>
    )
  }
  return (
    <div className="flex justify-center">
      <span className="text-[10px] text-muted-foreground/30">—</span>
    </div>
  )
}

// A season cell with a plain (non-option) salary — an editable pill if it
// came from a saved extension/FA contract, EXT/MLE tags, and undo/delete
// controls for a soft-deleted extension.
export function PlainSalaryCell({
  player,
  season,
  displaySalary,
  savedContracts,
  deletedContractIds,
  setDeletedContractIds,
  removeSavedContract,
  onEditContract,
}: {
  player: { id: string; name: string; source: 'current' | 'saved' | 'trade-incoming' }
  season: Season
  displaySalary: number
  savedContracts: SavedContract[]
  deletedContractIds: Set<string>
  setDeletedContractIds: (ids: Set<string>) => void
  removeSavedContract: (id: string) => void
  onEditContract: (contract: SavedContract, player: { id: string; name: string; source: 'current' | 'saved' | 'trade-incoming' }) => void
}) {
  const extensionContractRaw = (player.source === 'current' || player.source === 'trade-incoming')
    ? savedContracts.find(c => c.type === 'extension' && c.playerId === player.id && c.salary[season])
    : undefined
  const isExtensionDeleted = !!extensionContractRaw && deletedContractIds.has(extensionContractRaw.id)
  const extensionContract = extensionContractRaw && !isExtensionDeleted ? extensionContractRaw : undefined
  const savedFAContract = player.source === 'saved'
    ? savedContracts.find(c => c.id === player.id)
    : undefined
  const isFAContractDeleted = !!savedFAContract && deletedContractIds.has(savedFAContract.id)
  const editableContract = extensionContract ?? (isFAContractDeleted ? undefined : savedFAContract)
  const isExtensionSalary = !!extensionContract
  const isCellDeleted = isExtensionDeleted || isFAContractDeleted
  const isMLESalary = player.source === 'saved' && !isFAContractDeleted && displaySalary > 0 &&
    savedContracts.some(c => c.id === player.id && c.isMLE)

  return (
    <div className="inline-flex items-center gap-1">
      {editableContract ? (
        <button
          onClick={() => onEditContract(editableContract, player)}
          className={cn(
            SALARY_PILL_BASE,
            "transition-opacity hover:opacity-70 cursor-pointer",
            getSalaryColor(displaySalary)
          )}
          title={`Edit ${player.name}'s ${editableContract.type === 'extension' ? 'extension' : 'contract'}`}
        >
          {formatCurrency(displaySalary)}
        </button>
      ) : (
        <span
          className={cn(
            isCellDeleted
              ? "text-[12px] font-mono tabular-nums text-muted-foreground/50 line-through"
              : cn(SALARY_PILL_BASE, getSalaryColor(displaySalary))
          )}
        >
          {formatCurrency(displaySalary)}
        </span>
      )}
      {isExtensionSalary && (
        <span className="text-[8px] px-0.5 rounded font-semibold bg-purple-500/15 text-purple-700">
          EXT
        </span>
      )}
      {isMLESalary && (
        <span className="text-[8px] px-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-700">
          MLE
        </span>
      )}
      {isExtensionDeleted && extensionContractRaw && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              const newDeleted = new Set(deletedContractIds)
              newDeleted.delete(extensionContractRaw.id)
              setDeletedContractIds(newDeleted)
            }}
            className="text-muted-foreground hover:text-emerald-500 transition-colors"
            title="Undo"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={() => removeSavedContract(extensionContractRaw.id)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Delete permanently"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// Adjusts a future first-round pick's assumed draft slot (1-30), which
// re-scales its rookie-deal salary.
export function PickNumberSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(val) => onChange(parseInt(val))}>
      <SelectTrigger
        size="sm"
        className="!h-[18px] text-[10px] px-1.5 py-0 min-w-0 w-auto gap-0.5 border-border/50 text-muted-foreground"
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
  )
}

export function RosterTable() {
  const {
    roster,
    savedContracts,
    getEffectiveSalary,
    toggleTeamOption,
    togglePlayerOption,
    isOptionExercised,
    deletedContractIds,
    setDeletedContractIds,
    removeSavedContract,
    draftPickPlayers,
    pickNumberOverrides,
    setPickNumberOverride,
    releasedRosterIds,
    releaseRosterPlayer,
    restoreRosterPlayer,
    savedTrades,
    tradedPickIds,
    selectedTeam,
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

  const { displayedSeasons, allPlayers, projections } = useRosterTableData()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [seasonColWidth, setSeasonColWidth] = useState(MIN_SEASON_COL_WIDTH)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const targetIndex = SEASONS.indexOf(TARGET_LAST_VISIBLE_SEASON)
    const visibleSeasonCount = Math.max(1, Math.min(displayedSeasons.length, targetIndex + 1))

    const recompute = () => {
      const available = container.clientWidth - PLAYER_COL_WIDTH
      setSeasonColWidth(Math.max(MIN_SEASON_COL_WIDTH, Math.floor(available / visibleSeasonCount)))
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    // Belt-and-suspenders: some embedded/automated browser environments resize
    // the viewport without reliably firing ResizeObserver callbacks.
    window.addEventListener('resize', recompute)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [displayedSeasons.length])

  return (
    <>
      <Card className="bg-card border-border text-[13px] h-full flex flex-col py-0 gap-0">
        <CardHeader className="pt-4 pb-3 px-[18px] gap-0 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-[15px] font-bold tracking-tight">Roster & Contracts</CardTitle>
              <Badge variant="secondary" className="text-[10.5px] font-bold px-2 py-[2px] rounded-md">
                {roster.length} players
              </Badge>
            </div>
            <div className="flex items-center gap-3.5 text-[10.5px]">
              <SaveCapSheetButton />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex flex-col flex-1 min-h-0">
          <div ref={scrollContainerRef} className="overflow-x-auto flex-1 min-h-0 overflow-y-auto">
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-muted/30">
                  <th className="sticky left-0 bg-muted/30 px-3 pt-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground w-[185px]">
                    Player
                  </th>
                  {displayedSeasons.map((season) => (
                    <th
                      key={season}
                      className="px-2 pt-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground"
                      style={{ width: seasonColWidth }}
                    >
                      {season}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border bg-muted/30">
                  <th className="sticky left-0 bg-muted/30 px-3 pb-1.5 text-left text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60 w-[185px]">
                    Cap
                  </th>
                  {displayedSeasons.map((season) => {
                    const cap = CAP_THRESHOLDS[season]?.find((t) => t.type === 'soft-cap')?.value
                    return (
                      <th
                        key={season}
                        className="px-2 pb-1.5 text-center text-[9px] font-mono text-muted-foreground/60"
                        style={{ width: seasonColWidth }}
                      >
                        {cap ? formatCurrency(cap) : ''}
                      </th>
                    )
                  })}
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
                  const isFreeAgentRow = player.source === 'saved' && 'type' in player && player.type === 'free-agent'
                  const isFADeleted = isFreeAgentRow && 'isDeleted' in player && player.isDeleted

                  return (
                    <tr
                      key={player.id}
                      className={cn(
                        "group border-b border-border/50 hover:bg-muted/20 transition-colors",
                        isFreeAgentRow && !isFADeleted && "bg-sky-500/10",
                        isTradeIncoming && "bg-chart-4/5",
                        (isReleased || isTraded || isFADeleted) && "opacity-40"
                      )}
                    >
                      <td className={cn(
                        "sticky left-0 px-3 py-1.5",
                        isFreeAgentRow && !isFADeleted
                          ? "bg-sky-500/10"
                          : isTradeIncoming
                          ? "bg-chart-4/5"
                          : "bg-card"
                      )}>
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "font-medium text-[12px] whitespace-nowrap",
                            (isReleased || isTraded || isFADeleted) && "line-through text-muted-foreground"
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
                                  ? "text-sky-700 border-sky-700"
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
                          {isFreeAgentRow && !isFADeleted && (
                            <button
                              onClick={() => {
                                const newDeleted = new Set(deletedContractIds)
                                newDeleted.add(player.id)
                                setDeletedContractIds(newDeleted)
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-muted-foreground/50 hover:text-red-500"
                              title="Remove signing"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                          {isFADeleted && (
                            <div className="flex items-center gap-1 ml-0.5">
                              <button
                                onClick={() => {
                                  const newDeleted = new Set(deletedContractIds)
                                  newDeleted.delete(player.id)
                                  setDeletedContractIds(newDeleted)
                                }}
                                className="text-muted-foreground hover:text-emerald-500 transition-colors"
                                title="Undo"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => removeSavedContract(player.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete permanently"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
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
                                c => c.type === 'extension' && c.playerId === player.id
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
                            c => c.type === 'extension' && c.playerId === player.id && c.salary[s]
                          )
                          return effectiveSal === 0 && !hasExt
                        })

                        // Only show extend button on the first empty season (not for released players)
                        const shouldShowExtendButton = (isRosterPlayer || isTradeIncoming) && !isReleased && firstEmptySeasonIndex === index && firstEmptySeasonIndex !== -1

                        if (!displaySalary) {
                          return (
                            <td key={season} className="px-2 py-1.5">
                              <EmptyOrExtendCell
                                shouldShowExtendButton={shouldShowExtendButton}
                                player={player as Player}
                                season={season}
                                onExtend={(p, s) => setExtensionModal({ player: p, isOpen: true, startSeason: s })}
                              />
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

                        return (
                          <td key={season} className="px-2 py-1.5 text-left">
                            <PlainSalaryCell
                              player={player}
                              season={season}
                              displaySalary={displaySalary}
                              savedContracts={savedContracts}
                              deletedContractIds={deletedContractIds}
                              setDeletedContractIds={setDeletedContractIds}
                              removeSavedContract={removeSavedContract}
                              onEditContract={(contract) => setEditContractModal({ contract, player: player as Player, isOpen: true })}
                            />
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
                              <PickNumberSelect
                                value={currentOverride ?? 16}
                                onChange={(n) => setPickNumberOverride(pick.id, n)}
                              />
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
                          <span className={cn(SALARY_PILL_BASE, getSalaryColor(salary))}>
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
                              <span className={cn(SALARY_PILL_BASE, getSalaryColor(salary))}>
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
                <tr className="border-t-2" style={{ borderTopColor: selectedTeam.primaryColor }}>
                  <td className="sticky left-0 bg-muted px-3 py-2">
                    <span className="text-[12.5px] font-bold text-foreground">Total Payroll</span>
                  </td>
                  {displayedSeasons.map((season) => {
                    const proj = projections.find((p) => p.season === season)!
                    return (
                      <td key={season} className="px-2 py-2 text-left">
                        <TotalPayrollCell proj={proj} />
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
