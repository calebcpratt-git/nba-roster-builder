'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { useRosterTableData } from '@/hooks/use-roster-table-data'
import { SEASONS, Season, Player, SavedContract } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS } from '@/lib/data'
import {
  OptionSalaryCell,
  TotalPayrollCell,
  EmptyOrExtendCell,
  PlainSalaryCell,
  PickNumberSelect,
  getSalaryColor,
  SALARY_PILL_BASE,
} from '@/components/roster-table'
import { ExtensionModal } from '@/components/extension-modal'
import { EditContractModal } from '@/components/edit-contract-modal'
import { SaveCapSheetButton } from '@/components/save-cap-sheet-modal'
import { DraftPickHoverContent } from '@/components/draft-pick-hover'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const PLAYER_COL_W = 122
const SEASON_COL_W = 104

function NameCell({ children, dim = false, className }: { children: React.ReactNode; dim?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "shrink-0 sticky left-0 z-[2] px-2.5 py-1.5 flex items-center gap-1 min-w-0 border-b border-border/40",
        dim ? "bg-muted/30" : "bg-card",
        className
      )}
      style={{ width: PLAYER_COL_W }}
    >
      {children}
    </div>
  )
}

// Tapping a releasable player's name opens a small "Release" popup in place
// of a trash icon that would otherwise sit next to every roster player.
function ReleasablePlayerName({ name, onRelease }: { name: string; onRelease: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="min-w-0 text-left">
          <span className="font-semibold text-xs truncate block">{name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto p-1">
        <button
          onClick={() => { onRelease(); setIsOpen(false) }}
          className="flex items-center gap-1.5 text-xs font-medium text-destructive px-2 py-1.5 rounded hover:bg-destructive/10"
        >
          <Trash2 className="h-3 w-3" />
          Release
        </button>
      </PopoverContent>
    </Popover>
  )
}

function DashCell({ isLast }: { isLast?: boolean }) {
  return (
    <div
      className={cn("shrink-0 flex items-center justify-center py-1.5", !isLast && "border-b border-border/40")}
      style={{ width: SEASON_COL_W }}
    >
      <span className="text-[10px] text-muted-foreground/40">—</span>
    </div>
  )
}

export function MobileRosterTable() {
  const {
    savedContracts,
    getEffectiveSalary,
    toggleTeamOption,
    togglePlayerOption,
    isOptionExercised,
    deletedContractIds,
    setDeletedContractIds,
    removeSavedContract,
    updateSavedContract,
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

  const { displayedSeasons, allPlayers, projections } = useRosterTableData()

  const [extensionModal, setExtensionModal] = useState<{ player: Player | null; isOpen: boolean; startSeason?: Season }>({
    player: null,
    isOpen: false,
  })
  const [editContractModal, setEditContractModal] = useState<{ contract: SavedContract | null; player: Player | null; isOpen: boolean }>({
    contract: null,
    player: null,
    isOpen: false,
  })

  const tableWidth = PLAYER_COL_W + SEASON_COL_W * displayedSeasons.length

  return (
    <div className="flex-1 min-h-0 flex flex-col mt-2">
      <div className="shrink-0 px-4 pb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[13px]">Roster &amp; Contracts</span>
          <span className="bg-muted text-muted-foreground text-[9.5px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
            {allPlayers.filter(p => p.source === 'current').length} players
          </span>
        </div>
        <SaveCapSheetButton />
      </div>

      <div className="mx-4 mb-4 flex-1 min-h-0 bg-card rounded-[14px] overflow-auto relative">
        <div style={{ width: tableWidth }} className="flex flex-col">
          {/* Header */}
          <div className="flex sticky top-0 z-[3] bg-muted/40">
            <div
              className="shrink-0 sticky left-0 z-[4] bg-muted/40 px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground"
              style={{ width: PLAYER_COL_W }}
            >
              Player
            </div>
            {displayedSeasons.map((season) => (
              <div
                key={season}
                className="shrink-0 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground"
                style={{ width: SEASON_COL_W }}
              >
                {season}
              </div>
            ))}
          </div>

        {/* Player rows */}
        {allPlayers.map((player) => {
          const isCurrentRoster = player.source === 'current'
          const isRosterPlayer = 'isUserCreated' in player ? !player.isUserCreated : true
          const isReleasable = player.source === 'current'
          const isReleased = isReleasable && releasedRosterIds.has(player.id)
          const isTraded = 'isTraded' in player && player.isTraded
          const isTradeIncoming = player.source === 'trade-incoming'
          const isFreeAgentRow = player.source === 'saved' && 'type' in player && player.type === 'free-agent'
          const isFADeleted = isFreeAgentRow && 'isDeleted' in player && player.isDeleted
          const dimRow = isFreeAgentRow && !isFADeleted

          return (
            <div key={player.id} className="flex">
              <NameCell dim={dimRow || isTradeIncoming}>
                {isReleasable && !isReleased && !isTraded ? (
                  <ReleasablePlayerName name={player.name} onRelease={() => releaseRosterPlayer(player.id)} />
                ) : (
                  <span className={cn(
                    "font-semibold text-xs truncate",
                    (isReleased || isTraded || isFADeleted) && "line-through text-muted-foreground"
                  )}>
                    {player.name}
                  </span>
                )}
                {(player.source === 'saved' || isTradeIncoming) && (
                  <span className="text-[8.5px] font-bold px-1 rounded border shrink-0 text-chart-2 border-chart-2">
                    {isTradeIncoming ? 'TRADE' : 'type' in player && player.type === 'extension' ? 'EXT' : 'FA'}
                  </span>
                )}
                {isReleased && (
                  <button onClick={() => restoreRosterPlayer(player.id)} className="shrink-0 text-muted-foreground" title="Restore player">
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
                    className="shrink-0 text-muted-foreground/50"
                    title="Remove signing"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                {isFADeleted && (
                  <button onClick={() => removeSavedContract(player.id)} className="shrink-0 text-muted-foreground" title="Delete permanently">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </NameCell>

              {displayedSeasons.map((season, index) => {
                const rawSalary = player.salary[season] || 0
                const extensionSalary = (player.source === 'current' || player.source === 'trade-incoming')
                  ? (() => {
                      const ext = savedContracts.find(c => c.type === 'extension' && c.playerId === player.id)
                      return ext?.salary[season] || 0
                    })()
                  : 0
                const displaySalary = rawSalary || extensionSalary
                const optionType = player.options[season]
                const hasOption = !!optionType
                const optionExercised = hasOption ? (isOptionExercised(player.id, season, optionType) ?? true) : true
                const isLast = index === displayedSeasons.length - 1

                const firstEmptySeasonIndex = SEASONS.findIndex(s => {
                  const effectiveSal = player.source === 'current'
                    ? getEffectiveSalary(player as Player, s)
                    : (player.salary[s] || 0)
                  const hasExt = savedContracts.some(c => c.type === 'extension' && c.playerId === player.id && c.salary[s])
                  return effectiveSal === 0 && !hasExt
                })
                const shouldShowExtendButton = (isRosterPlayer || isTradeIncoming) && !isReleased && firstEmptySeasonIndex === index && firstEmptySeasonIndex !== -1

                return (
                  <div
                    key={season}
                    className={cn("shrink-0 flex items-center justify-center py-1.5 px-1", !isLast && "border-b border-border/40")}
                    style={{ width: SEASON_COL_W }}
                  >
                    {!displaySalary ? (
                      <EmptyOrExtendCell
                        shouldShowExtendButton={shouldShowExtendButton}
                        player={player as Player}
                        season={season}
                        onExtend={(p, s) => setExtensionModal({ player: p, isOpen: true, startSeason: s })}
                      />
                    ) : hasOption ? (
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
                          if (optionType === 'Team') toggleTeamOption(player.id, season, exercise)
                          else togglePlayerOption(player.id, season, exercise)
                        }}
                      />
                    ) : (
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
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Draft picks */}
        {draftPickPlayers.length > 0 && (
          <div className="flex bg-muted/40">
            <div className="shrink-0 sticky left-0 bg-muted/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground" style={{ width: PLAYER_COL_W }}>
              Draft Picks
            </div>
            {displayedSeasons.map((s) => <div key={s} className="shrink-0" style={{ width: SEASON_COL_W }} />)}
          </div>
        )}
        {draftPickPlayers.map((pick, pickIdx) => {
          const yearMatch = pick.name.match(/^(\d{4}) - 1st/)
          const pickYear = yearMatch ? parseInt(yearMatch[1]) : 0
          const isAdjustable = pickYear >= 2027 && !tradedPickIds.has(pick.id)
          const currentOverride = pickNumberOverrides[pick.id] ?? null
          const isPickTraded = tradedPickIds.has(pick.id)
          const isLastRow = pickIdx === draftPickPlayers.length - 1

          return (
            <div key={pick.id} className="flex">
              <NameCell dim>
                <HoverCard openDelay={150}>
                  <HoverCardTrigger asChild>
                    <span className={cn(
                      "text-[11px] font-medium text-muted-foreground truncate underline decoration-dotted underline-offset-2",
                      isPickTraded && "line-through"
                    )}>
                      {pick.name}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-64 p-3 text-xs">
                    <DraftPickHoverContent dp={pick.draftPick} />
                  </HoverCardContent>
                </HoverCard>
                {isAdjustable && (
                  <PickNumberSelect value={currentOverride ?? 16} onChange={(n) => setPickNumberOverride(pick.id, n)} />
                )}
              </NameCell>
              {displayedSeasons.map((season, index) => {
                const salary = pick.salary[season] || 0
                const optionType = pick.options[season]
                const hasOption = !!optionType
                const optionExercised = hasOption ? (isOptionExercised(pick.id, season, optionType) ?? true) : true
                const isLast = index === displayedSeasons.length - 1
                return (
                  <div
                    key={season}
                    className={cn("shrink-0 flex items-center justify-center py-1.5 px-1", !(isLast && isLastRow) && "border-b border-border/40")}
                    style={{ width: SEASON_COL_W }}
                  >
                    {!salary ? (
                      <DashCell isLast />
                    ) : hasOption ? (
                      <OptionSalaryCell
                        playerId={pick.id}
                        optionType={optionType}
                        isExercised={optionExercised}
                        season={season}
                        salary={salary}
                        isSaved={false}
                        player={pick as unknown as Player}
                        isFirstEmpty={false}
                        onExtend={() => {}}
                        isOptionExercisedFn={(id, s, t) => isOptionExercised(id, s, t) ?? true}
                        onToggle={(exercise) => {
                          if (optionType === 'Team') toggleTeamOption(pick.id, season, exercise)
                          else togglePlayerOption(pick.id, season, exercise)
                        }}
                      />
                    ) : (
                      <span className={cn(SALARY_PILL_BASE, getSalaryColor(salary))}>{formatCurrency(salary)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Incoming trade picks */}
        {savedTrades.flatMap((trade) => trade.incomingPicks).map((pick) => (
          <div key={pick.id} className="flex">
            <NameCell className="bg-chart-4/5">
              <span className="text-[11px] font-medium text-muted-foreground truncate">{pick.name}</span>
              <span className="text-[8.5px] font-bold px-1 rounded border shrink-0 text-chart-4 border-chart-4">TRADE</span>
            </NameCell>
            {displayedSeasons.map((season, index) => {
              const salary = pick.salary[season] || 0
              const optionType = pick.options[season]
              const hasOption = !!optionType
              const optionExercised = hasOption ? (isOptionExercised(pick.id, season, optionType) ?? true) : true
              const isLast = index === displayedSeasons.length - 1
              return (
                <div key={season} className={cn("shrink-0 flex items-center justify-center py-1.5 px-1 bg-chart-4/5", !isLast && "border-b border-border/40")} style={{ width: SEASON_COL_W }}>
                  {!salary ? (
                    <DashCell isLast />
                  ) : hasOption ? (
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
                        if (optionType === 'Team') toggleTeamOption(pick.id, season, exercise)
                        else togglePlayerOption(pick.id, season, exercise)
                      }}
                    />
                  ) : (
                    <span className={cn(SALARY_PILL_BASE, getSalaryColor(salary))}>{formatCurrency(salary)}</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Footer */}
        <div className="flex sticky bottom-0 z-[3] bg-muted border-t-2" style={{ borderTopColor: selectedTeam.primaryColor }}>
          <div className="shrink-0 sticky left-0 z-[4] bg-muted px-2.5 py-2 font-extrabold text-[12.5px]" style={{ width: PLAYER_COL_W }}>
            Total Payroll
          </div>
          {displayedSeasons.map((season) => {
            const proj = projections.find((p) => p.season === season)!
            return (
              <div key={season} className="shrink-0 flex items-center justify-center py-2" style={{ width: SEASON_COL_W }}>
                <TotalPayrollCell proj={proj} />
              </div>
            )
          })}
        </div>
        </div>
      </div>

      <ExtensionModal
        player={extensionModal.player}
        isOpen={extensionModal.isOpen}
        startSeason={extensionModal.startSeason}
        onClose={() => setExtensionModal({ player: null, isOpen: false })}
      />
      <EditContractModal
        contract={editContractModal.contract}
        isOpen={editContractModal.isOpen}
        onClose={() => setEditContractModal({ contract: null, player: null, isOpen: false })}
        onSave={(updated) => {
          updateSavedContract(updated)
          setEditContractModal({ contract: null, player: null, isOpen: false })
        }}
      />
    </div>
  )
}
