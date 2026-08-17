'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Season, SEASONS, SavedTrade, TradeMovement } from '@/lib/types'
import { NormalizedTrade, normalizeTrade, toSavedTrade } from '@/lib/trade-model'
import { getTeamRoster, ALL_TEAMS, TEAM_NAMES, formatCurrency, getCapStatus, getCapStatusColor } from '@/lib/data'
import { getDraftPickPlayers, DraftPick } from '@/lib/draft-picks'
import { DraftPickHoverContent } from '@/components/draft-pick-hover'
import { getScaledRookieSalary, SECOND_ROUND_SALARY_BY_SEASON } from '@/lib/rookie-salaries'
import { getTeamCapState } from '@/lib/team-cap-state'
import {
  getPostTradeTotal,
  parsePickIdMeta,
  TRADE_EVAL_SEASON,
  FIDELITY_NOTE,
} from '@/lib/trade-validation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Plus, X, Check } from 'lucide-react'

// The CBA doesn't cap participants, but past five the columns stop being
// readable and real deals essentially never go further.
const MAX_TEAMS = 5

interface TradeModalProps {
  isOpen: boolean
  onClose: () => void
  editingTrade?: SavedTrade
}

function computePickSalary(
  year: number,
  round: 'First Round' | 'Second Round',
  pickNumber: number
): { salary: Partial<Record<Season, number>>; options: Partial<Record<Season, 'Player' | 'Team'>> } {
  const startSeasonStr = `${year}-${String(year + 1).slice(2)}` as Season
  const startIdx = SEASONS.indexOf(startSeasonStr)
  const salary: Partial<Record<Season, number>> = {}
  const options: Partial<Record<Season, 'Player' | 'Team'>> = {}
  if (startIdx === -1) return { salary, options }
  if (round === 'First Round') {
    const scaled = getScaledRookieSalary(pickNumber, year)
    if (scaled) {
      const [y1, y2, y3, y4] = [SEASONS[startIdx], SEASONS[startIdx + 1], SEASONS[startIdx + 2], SEASONS[startIdx + 3]]
      if (y1) salary[y1] = scaled.year1
      if (y2) salary[y2] = scaled.year2
      if (y3) { salary[y3] = scaled.year3; options[y3] = 'Team' }
      if (y4) { salary[y4] = scaled.year4; options[y4] = 'Team' }
    }
  } else {
    for (let i = startIdx; i < Math.min(startIdx + 4, SEASONS.length); i++) {
      const s = SEASONS[i]
      salary[s] = SECOND_ROUND_SALARY_BY_SEASON[s] ?? 1_300_000
    }
  }
  return { salary, options }
}

function getFirstYearSalary(salary: Partial<Record<Season, number>>) {
  for (const season of SEASONS) {
    if (salary[season]) return salary[season]!
  }
  return 0
}

function ContractDetail({
  name,
  salary,
  options,
}: {
  name: string
  salary: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
}) {
  const seasons = SEASONS.filter((s) => salary[s] && salary[s]! > 0)
  if (seasons.length === 0) return null
  return (
    <div className="w-48 p-2.5">
      <p className="text-xs font-semibold mb-2 truncate">{name}</p>
      <div className="space-y-1">
        {seasons.map((s) => {
          const opt = options?.[s]
          return (
            <div key={s} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s}</span>
              <div className="flex items-center gap-1">
                <span className="font-mono tabular-nums">{formatCurrency(salary[s]!)}</span>
                {opt && (
                  <span className={cn(
                    'text-[8px] px-0.5 rounded font-semibold',
                    opt === 'Team' ? 'bg-amber-500/20 text-amber-700' : 'bg-sky-500/20 text-sky-700'
                  )}>
                    {opt === 'Team' ? 'TO' : 'PO'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HoverName({
  name,
  salary,
  options,
  draftPick,
  className,
}: {
  name: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
  className?: string
}) {
  const [hovering, setHovering] = useState(false)
  const hasContract = salary && Object.values(salary).some((v) => v && v > 0)

  if (!draftPick && !hasContract) {
    return <span className={cn('font-medium truncate flex-1', className)}>{name}</span>
  }

  return (
    <Popover open={hovering}>
      <PopoverTrigger asChild>
        <span
          className={cn('font-medium truncate flex-1 cursor-default underline decoration-dotted decoration-muted-foreground/40 underline-offset-2', className)}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {name}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className={draftPick ? 'w-64 p-3 text-xs' : 'p-0 w-auto'}
        sideOffset={8}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {draftPick ? <DraftPickHoverContent dp={draftPick} /> : <ContractDetail name={name} salary={salary!} options={options} />}
      </PopoverContent>
    </Popover>
  )
}

// Row in the "available" list — clicking adds to trade
function AvailableRow({
  label,
  sub,
  salary,
  options,
  draftPick,
  onClick,
}: {
  label: string
  sub?: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs hover:bg-muted/60 transition-colors group cursor-pointer"
    >
      <HoverName name={label} salary={salary} options={options} draftPick={draftPick} className="text-foreground" />
      <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
        {sub && <span className="text-muted-foreground font-mono tabular-nums">{sub}</span>}
        <Plus className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
      </div>
    </div>
  )
}

// Chip in the "sending" tray — carries the destination picker that makes
// partner-to-partner legs expressible, plus (for a player landing on a team
// with a usable exception) the held-TPE picker.
function TradeChip({
  label,
  sub,
  salary,
  options,
  draftPick,
  onRemove,
  destinations,
  destination,
  onDestinationChange,
  tpeOptions,
  tpeValue,
  onTpeChange,
}: {
  label: string
  sub?: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
  onRemove: () => void
  destinations: string[]
  destination: string
  onDestinationChange: (to: string) => void
  tpeOptions?: { id: string; label: string }[]
  tpeValue?: string
  onTpeChange?: (tpeId: string) => void
}) {
  return (
    <div className="rounded bg-muted/50 border border-border/60">
      <div className="flex items-center justify-between px-2 py-1 text-xs">
        <HoverName name={label} salary={salary} options={options} draftPick={draftPick} className="text-foreground" />
        <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
          {sub && <span className="text-muted-foreground font-mono tabular-nums text-[10px]">{sub}</span>}
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Remove ${label} from trade`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="px-2 pb-1 space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 shrink-0">to</span>
          <select
            value={destination}
            onChange={(e) => onDestinationChange(e.target.value)}
            className="flex-1 h-5 text-[10px] bg-background border border-border/60 rounded px-1"
            aria-label={`Destination team for ${label}`}
          >
            {destinations.map((t) => (
              <option key={t} value={t}>{TEAM_NAMES[t] || t}</option>
            ))}
          </select>
        </div>
        {tpeOptions && tpeOptions.length > 0 && (
          <select
            value={tpeValue ?? ''}
            onChange={(e) => onTpeChange?.(e.target.value)}
            className="w-full h-5 text-[10px] bg-background border border-border/60 rounded px-1 text-muted-foreground"
            aria-label={`Trade exception absorbing ${label}`}
          >
            <option value="">Match with salary (no TPE)</option>
            {tpeOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 bg-muted/20">
      {children}
    </div>
  )
}

export function TradeModal({ isOpen, onClose, editingTrade }: TradeModalProps) {
  const {
    roster,
    draftPickPlayers,
    selectedTeamAbbr,
    addSavedTrade,
    updateSavedTrade,
    analyzeTrade,
    tradedRosterPlayerIds,
    tradedPickIds,
    savedContracts,
    deletedContractIds,
    getEffectiveSalary,
  } = useRoster()

  const [teams, setTeams] = useState<string[]>([selectedTeamAbbr])
  const [movements, setMovements] = useState<TradeMovement[]>([])
  const [addTeamValue, setAddTeamValue] = useState('')

  const [pickDraft, setPickDraft] = useState<{ year: string; round: 'First Round' | 'Second Round'; number: string }>({
    year: '2027',
    round: 'First Round',
    number: '16',
  })

  useEffect(() => {
    if (!isOpen) return
    if (editingTrade) {
      const normalized = normalizeTrade(editingTrade, selectedTeamAbbr)
      setTeams(normalized.teams)
      setMovements(normalized.movements)
    } else {
      setTeams([selectedTeamAbbr])
      setMovements([])
    }
  }, [isOpen, editingTrade?.id, selectedTeamAbbr])

  const partners = teams.filter((t) => t !== selectedTeamAbbr)
  const availableTeams = ALL_TEAMS.filter((t) => !teams.includes(t))

  // Player.id is only unique within one team's roster — it's `player-${idx}`
  // per getTeamRoster call, not global (see lib/data.ts). The old two-team
  // modal never hit this because "your side" and "their side" lived in
  // separate state variables; a 3+ team deal merges every team's assets into
  // one flat `movements` array, so two different teams' players can share an
  // id (e.g. both happen to be roster index 4). Every dedup/lookup/removal
  // below is therefore keyed on the (team, id) pair, never id alone — pick and
  // custom-asset ids already embed their team, but treating them the same way
  // costs nothing and removes the asymmetry as a place for this bug to return.
  function assetKey(from: string, id: string): string {
    return `${from}::${id}`
  }

  // In edit mode, the trade being edited shouldn't count its own assets as
  // "already traded away" by some other saved trade.
  const editingOwnAssetIds = useMemo(() => {
    if (!editingTrade) return new Set<string>()
    const normalized = normalizeTrade(editingTrade, selectedTeamAbbr)
    return new Set(normalized.movements.filter((m) => m.from === selectedTeamAbbr).map((m) => m.id))
  }, [editingTrade?.id, selectedTeamAbbr])

  const inTradeKeys = useMemo(() => new Set(movements.map((m) => assetKey(m.from, m.id))), [movements])

  function assetsAvailableFor(teamAbbr: string): {
    players: Array<{ id: string; name: string; salary: Partial<Record<Season, number>>; options?: Partial<Record<Season, 'Player' | 'Team'>> }>
    picks: Array<{ id: string; name: string; salary: Partial<Record<Season, number>>; options: Partial<Record<Season, 'Player' | 'Team'>>; draftPick?: DraftPick }>
  } {
    const isOwn = teamAbbr === selectedTeamAbbr

    if (isOwn) {
      const rosterPlayers = roster
        .filter((p) => (!tradedRosterPlayerIds.has(p.id) || editingOwnAssetIds.has(p.id)) && !inTradeKeys.has(assetKey(teamAbbr, p.id)))
        .map((p) => ({
          id: p.id,
          name: p.name,
          salary: Object.fromEntries(
            SEASONS.map((s) => [s, getEffectiveSalary(p, s)] as const).filter(([, v]) => v > 0)
          ) as Partial<Record<Season, number>>,
          options: p.options,
        }))
      const faContracts = savedContracts
        .filter((c) => c.type === 'free-agent' && !deletedContractIds.has(c.id) && !inTradeKeys.has(assetKey(teamAbbr, c.id)))
        .map((c) => ({ id: c.id, name: c.playerName, salary: c.salary }))
      const picks = draftPickPlayers
        .filter((p) => (!tradedPickIds.has(p.id) || editingOwnAssetIds.has(p.id)) && !inTradeKeys.has(assetKey(teamAbbr, p.id)))
        .map((p) => ({ id: p.id, name: p.name, salary: p.salary, options: p.options, draftPick: p.draftPick }))
      return { players: [...rosterPlayers, ...faContracts], picks }
    }

    return {
      players: getTeamRoster(teamAbbr)
        .filter((p) => !inTradeKeys.has(assetKey(teamAbbr, p.id)))
        .map((p) => ({ id: p.id, name: p.name, salary: p.salary, options: p.options })),
      picks: getDraftPickPlayers(teamAbbr)
        .filter((p) => !inTradeKeys.has(assetKey(teamAbbr, p.id)))
        .map((p) => ({ id: p.id, name: p.name, salary: p.salary, options: p.options, draftPick: p.draftPick })),
    }
  }

  // Where a newly added asset goes by default: the next participant after the
  // sender, so a two-team deal needs no picking at all.
  function defaultDestination(from: string): string {
    return teams.find((t) => t !== from) ?? from
  }

  // Hard guard against a self-trade: defaultDestination has nowhere to send an
  // asset when its team is the only participant yet, and would otherwise fall
  // back to sending it to itself — which then shows up as both sent and
  // received by the same team, netting to $0 and masking the bug entirely.
  function addMovement(movement: TradeMovement) {
    if (movement.from === movement.to) return
    setMovements((prev) => [...prev, movement])
  }

  // Scoped by (from, id), not id alone — see assetKey above. A bare id match
  // would remove every team's colliding asset at once, not just the one the
  // user clicked.
  function removeMovement(from: string, id: string) {
    setMovements((prev) => prev.filter((m) => !(m.from === from && m.id === id)))
  }

  function updateMovement(from: string, id: string, patch: Partial<TradeMovement>) {
    setMovements((prev) => prev.map((m) => (m.from === from && m.id === id ? { ...m, ...patch } : m)))
  }

  function addTeam(abbr: string) {
    if (!abbr || teams.includes(abbr) || teams.length >= MAX_TEAMS) return
    setTeams((prev) => [...prev, abbr])
    setAddTeamValue('')
  }

  function removeTeam(abbr: string) {
    setTeams((prev) => prev.filter((t) => t !== abbr))
    setMovements((prev) => prev.filter((m) => m.from !== abbr && m.to !== abbr))
  }

  function addCustomPick(from: string) {
    const year = parseInt(pickDraft.year)
    const pickNumber = parseInt(pickDraft.number)
    const { salary, options } = computePickSalary(year, pickDraft.round, pickNumber)
    const roundLabel = pickDraft.round === 'First Round' ? '1st' : '2nd'
    addMovement({
      kind: 'pick',
      from,
      to: defaultDestination(from),
      id: `trade-custom-pick-${from}-${year}-${pickDraft.round}-${Date.now()}`,
      name: `${year} ${roundLabel}${pickDraft.round === 'First Round' ? ` (#${pickNumber})` : ''} (from ${from})`,
      salary,
      options,
      pickYear: year,
      pickRound: pickDraft.round === 'First Round' ? 1 : 2,
    })
  }

  function addCashLeg(from: string) {
    addMovement({
      kind: 'cash',
      from,
      to: defaultDestination(from),
      id: `trade-cash-${from}-${Date.now()}`,
      name: 'Cash',
      amount: 0,
    })
  }

  // The draft trade in canonical form, fed to the same analyzer the save-time
  // guard uses so the modal and the data layer can never disagree.
  const draftTrade: NormalizedTrade = useMemo(
    () => ({
      id: editingTrade?.id ?? 'draft',
      createdAt: editingTrade?.createdAt ?? new Date(),
      teams,
      movements,
      isSignAndTrade: editingTrade?.isSignAndTrade,
    }),
    [editingTrade?.id, editingTrade?.createdAt, editingTrade?.isSignAndTrade, teams, movements]
  )

  const analysis = useMemo(
    () => (partners.length > 0 ? analyzeTrade(draftTrade) : null),
    // analyzeTrade closes over live roster state and is re-created each render,
    // matching how the rest of this provider's helpers behave.
    [draftTrade, partners.length] // eslint-disable-line react-hooks/exhaustive-deps
  )

  function handleSave() {
    const saved = toSavedTrade(
      {
        id: editingTrade?.id ?? `trade-${Date.now()}`,
        createdAt: editingTrade?.createdAt ?? new Date(),
        teams,
        movements,
        isSignAndTrade: editingTrade?.isSignAndTrade,
      },
      selectedTeamAbbr
    )
    if (editingTrade) updateSavedTrade(saved)
    else addSavedTrade(saved)
    handleClose()
  }

  function handleClose() {
    setTeams([selectedTeamAbbr])
    setMovements([])
    setAddTeamValue('')
    setPickDraft({ year: '2027', round: 'First Round', number: '16' })
    onClose()
  }

  const canSave = partners.length > 0 && movements.length > 0

  // Resolves a pick's protection/swap detail for the hover card. Deliberately
  // not the "available" list, which excludes anything already in the tray —
  // exactly the picks this needs to describe.
  function draftPickFor(teamAbbr: string, pickId: string): DraftPick | undefined {
    const source = teamAbbr === selectedTeamAbbr ? draftPickPlayers : getDraftPickPlayers(teamAbbr)
    return source.find((p) => p.id === pickId)?.draftPick
  }

  // A plain function rather than a nested component: a component declared
  // inside the render body is a new type on every render, so React would
  // unmount and remount each column — dropping focus mid-keystroke in the cash
  // input.
  function renderTeamColumn(teamAbbr: string) {
    const isOwn = teamAbbr === selectedTeamAbbr
    const { players, picks } = assetsAvailableFor(teamAbbr)
    const sending = movements.filter((m) => m.from === teamAbbr)
    const receiving = movements.filter((m) => m.to === teamAbbr)
    const destinations = teams.filter((t) => t !== teamAbbr)
    const usedTpeIds = new Set(movements.map((m) => m.heldTpeId).filter(Boolean) as string[])

    return (
      <div
        key={teamAbbr}
        // One full-width column per swipe on a phone; fixed-width side-by-side
        // columns once there's room to compare them.
        className="flex flex-col border-r border-border last:border-r-0 shrink-0 grow-0 snap-start basis-full sm:basis-[264px] sm:min-w-[264px]"
      >
        <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
            {isOwn ? 'Your Side' : `${teamAbbr}`}
          </span>
          {!isOwn && (
            <button
              onClick={() => removeTeam(teamAbbr)}
              className="text-muted-foreground/60 hover:text-destructive transition-colors shrink-0"
              aria-label={`Remove ${teamAbbr} from trade`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <SectionLabel>Available — click to add</SectionLabel>
        <div className="h-40 overflow-y-auto p-1.5 space-y-0.5">
          {destinations.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-2">Add a partner team above before adding assets.</p>
          ) : players.length === 0 && picks.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-2">All assets added to trade</p>
          ) : (
            <>
              {players.map((p) => (
                <AvailableRow
                  key={p.id}
                  label={p.name}
                  sub={formatCurrency(getFirstYearSalary(p.salary))}
                  salary={p.salary}
                  options={p.options}
                  onClick={() =>
                    addMovement({
                      kind: 'player',
                      from: teamAbbr,
                      to: defaultDestination(teamAbbr),
                      id: p.id,
                      name: p.name,
                      salary: p.salary,
                      options: p.options ?? {},
                    })
                  }
                />
              ))}
              {picks.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] text-muted-foreground/60 px-2 pb-0.5 uppercase tracking-wide">Picks</p>
                  {picks.map((p) => {
                    const { pickYear, pickRound } = parsePickIdMeta(p.id)
                    return (
                      <AvailableRow
                        key={p.id}
                        label={p.name}
                        draftPick={p.draftPick}
                        onClick={() =>
                          addMovement({
                            kind: 'pick',
                            from: teamAbbr,
                            to: defaultDestination(teamAbbr),
                            id: p.id,
                            name: p.name,
                            salary: p.salary,
                            options: p.options,
                            pickYear,
                            pickRound,
                          })
                        }
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}

          <div className="pt-2 px-1 border-t border-border/40 mt-1 space-y-1">
            <p className="text-[10px] text-muted-foreground/70 px-1">Add custom pick</p>
            <div className="flex items-center gap-1">
              <Select value={pickDraft.year} onValueChange={(v) => setPickDraft((p) => ({ ...p, year: v }))}>
                <SelectTrigger className="h-6 text-[11px] w-[62px] px-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2026, 2027, 2028, 2029, 2030, 2031, 2032].map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={pickDraft.round} onValueChange={(v) => setPickDraft((p) => ({ ...p, round: v as 'First Round' | 'Second Round' }))}>
                <SelectTrigger className="h-6 text-[11px] w-[48px] px-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="First Round" className="text-xs">1st</SelectItem>
                  <SelectItem value="Second Round" className="text-xs">2nd</SelectItem>
                </SelectContent>
              </Select>
              {pickDraft.round === 'First Round' && (
                <Select value={pickDraft.number} onValueChange={(v) => setPickDraft((p) => ({ ...p, number: v }))}>
                  <SelectTrigger className="h-6 text-[11px] w-[48px] px-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">#{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0 shrink-0"
                onClick={() => addCustomPick(teamAbbr)}
                disabled={destinations.length === 0}
                aria-label={`Add custom pick from ${teamAbbr}`}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-full text-[10px]"
              onClick={() => addCashLeg(teamAbbr)}
              disabled={destinations.length === 0}
            >
              <Plus className="h-3 w-3 mr-1" /> Send cash
            </Button>
          </div>
        </div>

        <SectionLabel>Sending{sending.length > 0 ? ` · ${sending.length}` : ''}</SectionLabel>
        <div className="h-36 overflow-y-auto p-1.5 space-y-1">
          {sending.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-2">No assets selected yet</p>
          ) : (
            sending.map((m) => {
              if (m.kind === 'cash') {
                return (
                  <div key={assetKey(m.from, m.id)} className="rounded bg-muted/50 border border-border/60 px-2 py-1 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Cash</span>
                      <button onClick={() => removeMovement(m.from, m.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove cash from trade">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="100000"
                      placeholder="0"
                      value={m.amount || ''}
                      onChange={(e) => updateMovement(m.from, m.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="w-full h-5 px-1 rounded border border-border/60 bg-background text-[10px] font-mono"
                      aria-label="Cash amount"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 shrink-0">to</span>
                      <select
                        value={m.to}
                        onChange={(e) => updateMovement(m.from, m.id, { to: e.target.value })}
                        className="flex-1 h-5 text-[10px] bg-background border border-border/60 rounded px-1"
                        aria-label="Cash destination team"
                      >
                        {destinations.map((t) => (
                          <option key={t} value={t}>{TEAM_NAMES[t] || t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              }

              // A TPE belongs to the team *receiving* the player.
              const receivingCapState = getTeamCapState(m.to, TRADE_EVAL_SEASON)
              const salaryIn = getFirstYearSalary(m.salary ?? {})
              const eligibleTPEs =
                m.kind === 'player'
                  ? (receivingCapState?.heldTPEs ?? []).filter(
                      (t) => (t.id === m.heldTpeId || !usedTpeIds.has(t.id)) && salaryIn <= t.amount + 100_000
                    )
                  : []

              return (
                <TradeChip
                  key={assetKey(m.from, m.id)}
                  label={m.name ?? m.id}
                  sub={m.kind === 'player' ? formatCurrency(salaryIn) : undefined}
                  salary={m.salary}
                  options={m.options}
                  draftPick={m.kind === 'pick' ? draftPickFor(teamAbbr, m.id) : undefined}
                  onRemove={() => removeMovement(m.from, m.id)}
                  destinations={destinations}
                  destination={m.to}
                  onDestinationChange={(to) => updateMovement(m.from, m.id, { to })}
                  tpeOptions={eligibleTPEs.map((t) => ({
                    id: t.id,
                    label: `${m.to} TPE ${formatCurrency(t.amount)} (${t.fromPlayer ?? 'prior trade'})`,
                  }))}
                  tpeValue={m.heldTpeId ?? ''}
                  onTpeChange={(tpeId) => updateMovement(m.from, m.id, { heldTpeId: tpeId || undefined })}
                />
              )
            })
          )}
        </div>

        <SectionLabel>Receiving{receiving.length > 0 ? ` · ${receiving.length}` : ''}</SectionLabel>
        <div className="h-24 overflow-y-auto p-1.5 space-y-0.5">
          {receiving.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1.5">Nothing incoming</p>
          ) : (
            receiving.map((m) => (
              <div key={assetKey(m.from, m.id)} className="flex items-center justify-between px-2 py-1 text-xs rounded bg-muted/30">
                <span className="truncate font-medium">
                  {m.kind === 'cash' ? `Cash ${formatCurrency(m.amount ?? 0)}` : m.name ?? m.id}
                </span>
                <span className="text-[9px] text-muted-foreground shrink-0 ml-1.5">from {m.from}</span>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {/* Columns plus three trays per team overflow a laptop viewport, so the
          dialog caps its height and scrolls its body with the team picker and
          the save controls pinned. */}
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 shrink-0">
          <DialogHeader className="mb-3">
            <DialogTitle>{editingTrade ? 'Edit Trade' : 'Build Trade'}</DialogTitle>
            <DialogDescription className="sr-only">
              Select assets to trade between two or more teams.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium whitespace-nowrap">Teams:</span>
            <span className="text-xs font-semibold px-2 py-1 rounded bg-primary/10 text-primary">
              {selectedTeamAbbr}
            </span>
            {partners.map((abbr) => (
              <span key={abbr} className="text-xs font-medium px-2 py-1 rounded bg-muted flex items-center gap-1">
                {abbr}
                <button onClick={() => removeTeam(abbr)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${abbr}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {teams.length < MAX_TEAMS && (
              <Select value={addTeamValue} onValueChange={addTeam}>
                <SelectTrigger className="h-7 text-xs w-[180px]">
                  <SelectValue placeholder={partners.length === 0 ? 'Select a team...' : 'Add a team...'} />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams.map((abbr) => (
                    <SelectItem key={abbr} value={abbr} className="text-sm">
                      {TEAM_NAMES[abbr] || abbr} ({abbr})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
        {/* One column per participant, scrolling sideways past three teams */}
        <div className="border-t border-border overflow-x-auto snap-x snap-mandatory">
          <div className="flex">{teams.map((abbr) => renderTeamColumn(abbr))}</div>
        </div>

        {analysis && (
          <div className="border-t border-border px-5 py-3 space-y-2.5">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">After this trade</p>
              {analysis.sides.map((side) => {
                const postTotal = getPostTradeTotal(side, analysis.season, analysis.thresholds)
                const delta = postTotal - side.preTradeTotal
                const preStatus = getCapStatus(side.preTradeTotal, analysis.thresholds)
                const postStatus = getCapStatus(postTotal, analysis.thresholds)
                return (
                  <div key={side.teamAbbr} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium truncate flex items-center gap-1">
                      {side.teamName}
                      {side.approximate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground font-normal cursor-default underline decoration-dotted underline-offset-2">
                              (est.)
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Based on {side.teamName}&apos;s current roster plus any contracts and trades already built for them in this app — trades built from another team&apos;s perspective, and real-world moves outside this app, aren&apos;t visible here.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
                      <span className="text-muted-foreground">{formatCurrency(side.preTradeTotal)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={preStatus !== postStatus ? 'font-bold' : ''}>{formatCurrency(postTotal)}</span>
                      <span className={cn('text-[10px]', delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                        ({delta >= 0 ? '+' : '-'}
                        {formatCurrency(Math.abs(delta))})
                      </span>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', getCapStatusColor(preStatus))}>{preStatus}</span>
                      {preStatus !== postStatus && (
                        <>
                          <span className="text-muted-foreground">→</span>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 ring-current', getCapStatusColor(postStatus))}>
                            {postStatus}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {analysis.validation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 space-y-1">
                <p className="text-xs font-semibold text-destructive">Trade Invalid</p>
                {analysis.validation.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive-foreground/90">
                    {teams.length > 2 && e.teamAbbr && (
                      <span className="font-semibold">{e.teamAbbr}: </span>
                    )}
                    {e.message}
                  </p>
                ))}
              </div>
            )}

            {analysis.validation.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
                <p className="text-xs font-semibold text-amber-500">Heads up</p>
                {analysis.validation.warnings.map((w, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className="text-xs text-foreground/90">
                      {teams.length > 2 && w.teamAbbr && (
                        <span className="font-semibold">{w.teamAbbr}: </span>
                      )}
                      {w.message}
                    </p>
                    {w.whyUncertain && (
                      <p className="text-[11px] text-muted-foreground pl-2">
                        <span className="font-medium">Why this is uncertain:</span> {w.whyUncertain}
                      </p>
                    )}
                    {w.neededInfo && (
                      <p className="text-[11px] text-muted-foreground pl-2">
                        <span className="font-medium">To verify:</span> {w.neededInfo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {analysis.validation.errors.length === 0 && analysis.validation.warnings.length === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                <Check className="h-3.5 w-3.5" />
                No rule violations detected
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{FIDELITY_NOTE}</p>
          </div>
        )}
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-border shrink-0">
          <Button variant="outline" onClick={handleClose} className="flex-1 h-8 text-sm">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || (analysis ? !analysis.validation.isValid : false)}
            className="flex-1 h-8 text-sm"
            title={analysis && !analysis.validation.isValid ? 'Resolve the issues in Trade Invalid to save.' : undefined}
          >
            {editingTrade ? 'Save Changes' : 'Save Trade'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
