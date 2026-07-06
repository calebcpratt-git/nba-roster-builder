'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Season, SEASONS, SavedTrade } from '@/lib/types'
import { getTeamRoster, ALL_TEAMS, TEAM_NAMES, formatCurrency, CAP_THRESHOLDS, getCapStatus, getCapStatusColor } from '@/lib/data'
import { getDraftPickPlayers, DraftPick } from '@/lib/draft-picks'
import { DraftPickHoverContent } from '@/components/draft-pick-hover'
import { getScaledRookieSalary, SECOND_ROUND_SALARY_BY_SEASON } from '@/lib/rookie-salaries'
import {
  TradeAsset,
  TradeSideInput,
  ValidateTradeInput,
  validateTrade,
  getPostTradeTotal,
  getOwnedFirstRoundYears,
  parsePickIdMeta,
  TRADE_EVAL_SEASON,
  CURRENT_DRAFT_YEAR,
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

interface TradeModalProps {
  isOpen: boolean
  onClose: () => void
  editingTrade?: SavedTrade
}

interface PendingIncomingPick {
  id: string
  name: string
  fromTeam: string
  year: number
  round: 'First Round' | 'Second Round'
  pickNumber: number
  salary: Partial<Record<Season, number>>
  options: Partial<Record<Season, 'Player' | 'Team'>>
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

function getFirstYearSalary(player: { salary: Partial<Record<Season, number>> }) {
  for (const season of SEASONS) {
    if (player.salary[season]) return player.salary[season]!
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
                    opt === 'Team' ? 'bg-amber-500/20 text-amber-400' : 'bg-sky-500/20 text-sky-400'
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

// Chip in the "in trade" tray — clicking removes from trade
function TradeChip({
  label,
  sub,
  salary,
  options,
  draftPick,
  onRemove,
}: {
  label: string
  sub?: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
  onRemove: () => void
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded bg-muted/50 border border-border/60 text-xs">
      <HoverName name={label} salary={salary} options={options} draftPick={draftPick} className="text-foreground" />
      <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
        {sub && <span className="text-muted-foreground font-mono tabular-nums text-[10px]">{sub}</span>}
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
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
    tradedRosterPlayerIds,
    tradedPickIds,
    savedContracts,
    deletedContractIds,
    getEffectiveSalary,
    getTotalSalary,
    getTeamCapTotal,
  } = useRoster()

  const [tradeTeamAbbr, setTradeTeamAbbr] = useState<string>('')
  const [selectedOutgoingRosterIds, setSelectedOutgoingRosterIds] = useState<Set<string>>(new Set())
  const [selectedOutgoingPickIds, setSelectedOutgoingPickIds] = useState<Set<string>>(new Set())
  const [selectedIncomingPlayerIds, setSelectedIncomingPlayerIds] = useState<Set<string>>(new Set())
  const [selectedIncomingPickIds, setSelectedIncomingPickIds] = useState<Set<string>>(new Set())
  const [incomingCustomPicks, setIncomingCustomPicks] = useState<PendingIncomingPick[]>([])

  const [addPickYear, setAddPickYear] = useState('2027')
  const [addPickRound, setAddPickRound] = useState<'First Round' | 'Second Round'>('First Round')
  const [addPickNumber, setAddPickNumber] = useState('16')

  useEffect(() => {
    if (isOpen && editingTrade) {
      setTradeTeamAbbr(editingTrade.tradeTeamAbbr)
      setSelectedOutgoingRosterIds(new Set(editingTrade.outgoingRosterPlayerIds))
      setSelectedOutgoingPickIds(new Set(editingTrade.outgoingPickIds))
      setSelectedIncomingPlayerIds(new Set(editingTrade.incomingPlayers.map((p) => p.playerId)))
      setSelectedIncomingPickIds(new Set())
      setIncomingCustomPicks(
        editingTrade.incomingPicks.map((p) => ({
          id: p.id,
          name: p.name,
          fromTeam: p.fromTeam,
          year: 2027,
          round: 'First Round' as const,
          pickNumber: 16,
          salary: p.salary,
          options: p.options,
        }))
      )
    }
  }, [isOpen, editingTrade?.id])

  const tradeTeamRoster = useMemo(() => (tradeTeamAbbr ? getTeamRoster(tradeTeamAbbr) : []), [tradeTeamAbbr])
  const tradeTeamPicks = useMemo(() => (tradeTeamAbbr ? getDraftPickPlayers(tradeTeamAbbr) : []), [tradeTeamAbbr])

  const availableTeams = ALL_TEAMS.filter((t) => t !== selectedTeamAbbr)

  // In edit mode, don't count the trade being edited as "already traded"
  const editingOutgoingRosterIds = useMemo(() => new Set(editingTrade?.outgoingRosterPlayerIds ?? []), [editingTrade?.id])
  const editingOutgoingPickIds = useMemo(() => new Set(editingTrade?.outgoingPickIds ?? []), [editingTrade?.id])

  // Your assets — exclude already-traded and already-selected
  const availableOutgoingRoster = roster.filter(
    (p) =>
      (!tradedRosterPlayerIds.has(p.id) || editingOutgoingRosterIds.has(p.id)) &&
      !selectedOutgoingRosterIds.has(p.id)
  )
  const availableOutgoingFAContracts = savedContracts.filter(
    (c) => c.type === 'free-agent' && !deletedContractIds.has(c.id) && !selectedOutgoingRosterIds.has(c.id)
  )
  const availableOutgoingPicks = draftPickPlayers.filter(
    (p) =>
      (!tradedPickIds.has(p.id) || editingOutgoingPickIds.has(p.id)) &&
      !selectedOutgoingPickIds.has(p.id)
  )

  // Their assets — exclude already-selected
  const availableIncomingPlayers = tradeTeamRoster.filter((p) => !selectedIncomingPlayerIds.has(p.id))
  const availableIncomingPicks = tradeTeamPicks.filter((p) => !selectedIncomingPickIds.has(p.id))

  // Resolve full objects for "in trade" tray
  const selectedOutgoingRosterObjects = roster.filter((p) => selectedOutgoingRosterIds.has(p.id))
  const selectedOutgoingFAObjects = savedContracts.filter((c) => selectedOutgoingRosterIds.has(c.id))
  const selectedOutgoingPickObjects = draftPickPlayers.filter((p) => selectedOutgoingPickIds.has(p.id))
  const selectedIncomingPlayerObjects = tradeTeamRoster.filter((p) => selectedIncomingPlayerIds.has(p.id))
  const selectedIncomingPickObjects = tradeTeamPicks.filter((p) => selectedIncomingPickIds.has(p.id))

  // Assemble validation input from the current trays and run the pure
  // trade-rules validator. Both sides are evaluated independently; the
  // partner's numbers are estimates, so its findings surface as warnings
  // (see PARTNER_FINDINGS_ARE_WARNINGS in lib/trade-validation.ts).
  const tradeAnalysis = useMemo(() => {
    if (!tradeTeamAbbr) return null

    const yourOutgoing: TradeAsset[] = [
      ...selectedOutgoingRosterObjects.map((p) => ({
        kind: 'player' as const,
        id: p.id,
        name: p.name,
        salaryBySeason: Object.fromEntries(
          SEASONS.map((s) => [s, getEffectiveSalary(p, s)] as const).filter(([, v]) => v > 0)
        ) as Partial<Record<Season, number>>,
      })),
      ...selectedOutgoingFAObjects.map((c) => ({
        kind: 'player' as const,
        id: c.id,
        name: c.playerName,
        salaryBySeason: c.salary,
        isMinimum: c.isMinimum,
      })),
      ...selectedOutgoingPickObjects.map((p) => {
        const { pickYear, pickRound } = parsePickIdMeta(p.id)
        return { kind: 'pick' as const, id: p.id, name: p.name, salaryBySeason: p.salary, pickYear, pickRound }
      }),
    ]

    const yourIncoming: TradeAsset[] = [
      ...selectedIncomingPlayerObjects.map((p) => ({
        kind: 'player' as const,
        id: p.id,
        name: p.name,
        salaryBySeason: p.salary,
      })),
      ...selectedIncomingPickObjects.map((p) => {
        const { pickYear, pickRound } = parsePickIdMeta(p.id)
        return { kind: 'pick' as const, id: p.id, name: p.name, salaryBySeason: p.salary, pickYear, pickRound }
      }),
      ...incomingCustomPicks.map((p) => ({
        kind: 'pick' as const,
        id: p.id,
        name: p.name,
        salaryBySeason: p.salary,
        pickYear: p.year,
        pickRound: (p.round === 'First Round' ? 1 : 2) as 1 | 2,
      })),
    ]

    // Eval season = earliest season at/after TRADE_EVAL_SEASON any traded
    // player asset carries salary in (the app isn't date-aware, so real
    // trade-date matching is out of scope).
    const allPlayerAssets = [...yourOutgoing, ...yourIncoming].filter((a) => a.kind === 'player')
    const seasonsFromEval = SEASONS.slice(SEASONS.indexOf(TRADE_EVAL_SEASON))
    const season: Season =
      seasonsFromEval.find((s) => allPlayerAssets.some((a) => (a.salaryBySeason[s] ?? 0) > 0)) ?? TRADE_EVAL_SEASON
    const thresholds = CAP_THRESHOLDS[season]

    const yourPreTradeTotal = getTotalSalary(season).total
    // Partner total includes whatever contracts/trades have already been
    // built for them in this app (getTeamCapTotal reads their own saved
    // contracts + saved trades), not just their starting roster. Trades built
    // from another team's perspective, and real-world moves outside this app,
    // still aren't visible here — see the "(est.)" tooltip.
    const theirPreTradeTotal = getTeamCapTotal(tradeTeamAbbr, season)

    const yourSide: TradeSideInput = {
      side: 'yours',
      teamAbbr: selectedTeamAbbr,
      teamName: TEAM_NAMES[selectedTeamAbbr] || selectedTeamAbbr,
      preTradeTotal: yourPreTradeTotal,
      approximate: false,
      outgoing: yourOutgoing,
      incoming: yourIncoming,
    }
    const theirSide: TradeSideInput = {
      side: 'theirs',
      teamAbbr: tradeTeamAbbr,
      teamName: TEAM_NAMES[tradeTeamAbbr] || tradeTeamAbbr,
      preTradeTotal: theirPreTradeTotal,
      approximate: true,
      outgoing: yourIncoming,
      incoming: yourOutgoing,
    }

    const validationInput: ValidateTradeInput = {
      season,
      thresholds,
      currentDraftYear: CURRENT_DRAFT_YEAR,
      sides: [yourSide, theirSide],
      ownedFirstRoundYearsByTeam: {
        [selectedTeamAbbr]: getOwnedFirstRoundYears(selectedTeamAbbr),
        [tradeTeamAbbr]: getOwnedFirstRoundYears(tradeTeamAbbr),
      },
    }

    const validation = validateTrade(validationInput)

    const buildPreviewRow = (side: TradeSideInput) => {
      const postTotal = getPostTradeTotal(side, season, thresholds)
      return {
        teamAbbr: side.teamAbbr,
        teamName: side.teamName,
        approximate: side.approximate,
        preTotal: side.preTradeTotal,
        postTotal,
        delta: postTotal - side.preTradeTotal,
        preStatus: getCapStatus(side.preTradeTotal, thresholds),
        postStatus: getCapStatus(postTotal, thresholds),
      }
    }

    return {
      validation,
      yourPreview: buildPreviewRow(yourSide),
      theirPreview: buildPreviewRow(theirSide),
    }
  }, [
    tradeTeamAbbr,
    selectedTeamAbbr,
    selectedOutgoingRosterObjects,
    selectedOutgoingFAObjects,
    selectedOutgoingPickObjects,
    selectedIncomingPlayerObjects,
    selectedIncomingPickObjects,
    incomingCustomPicks,
    getEffectiveSalary,
    getTotalSalary,
    getTeamCapTotal,
  ])

  function addOutgoingRoster(id: string) {
    setSelectedOutgoingRosterIds((prev) => new Set(prev).add(id))
  }
  function removeOutgoingRoster(id: string) {
    setSelectedOutgoingRosterIds((prev) => { const s = new Set(prev); s.delete(id); return s })
  }
  function addOutgoingPick(id: string) {
    setSelectedOutgoingPickIds((prev) => new Set(prev).add(id))
  }
  function removeOutgoingPick(id: string) {
    setSelectedOutgoingPickIds((prev) => { const s = new Set(prev); s.delete(id); return s })
  }
  function addIncomingPlayer(id: string) {
    setSelectedIncomingPlayerIds((prev) => new Set(prev).add(id))
  }
  function removeIncomingPlayer(id: string) {
    setSelectedIncomingPlayerIds((prev) => { const s = new Set(prev); s.delete(id); return s })
  }
  function addIncomingPick(id: string) {
    setSelectedIncomingPickIds((prev) => new Set(prev).add(id))
  }
  function removeIncomingPick(id: string) {
    setSelectedIncomingPickIds((prev) => { const s = new Set(prev); s.delete(id); return s })
  }
  function addCustomIncomingPick() {
    const year = parseInt(addPickYear)
    const pickNum = parseInt(addPickNumber)
    const { salary, options } = computePickSalary(year, addPickRound, pickNum)
    const round = addPickRound === 'First Round' ? '1st' : '2nd'
    const id = `trade-incoming-pick-${tradeTeamAbbr}-${year}-${addPickRound}-${Date.now()}`
    const name = `${year} - ${round}${addPickRound === 'First Round' ? ` (#${pickNum})` : ''} (from ${tradeTeamAbbr})`
    setIncomingCustomPicks((prev) => [...prev, { id, name, fromTeam: tradeTeamAbbr, year, round: addPickRound, pickNumber: pickNum, salary, options }])
  }
  function removeCustomPick(id: string) {
    setIncomingCustomPicks((prev) => prev.filter((p) => p.id !== id))
  }

  function handleSave() {
    const incomingPlayers = selectedIncomingPlayerObjects.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      salary: p.salary,
      options: p.options,
    }))
    const incomingPicksFromTeam = selectedIncomingPickObjects.map((p) => ({
      id: `trade-in-${p.id}-${Date.now()}`,
      name: `${p.name} (from ${tradeTeamAbbr})`,
      fromTeam: tradeTeamAbbr,
      salary: p.salary,
      options: p.options,
    }))
    const incomingPicks = [
      ...incomingPicksFromTeam,
      ...incomingCustomPicks.map((p) => ({ id: p.id, name: p.name, fromTeam: p.fromTeam, salary: p.salary, options: p.options })),
    ]
    if (editingTrade) {
      updateSavedTrade({
        ...editingTrade,
        tradeTeamAbbr,
        outgoingRosterPlayerIds: Array.from(selectedOutgoingRosterIds),
        outgoingPickIds: Array.from(selectedOutgoingPickIds),
        incomingPlayers,
        incomingPicks,
      })
    } else {
      addSavedTrade({
        id: `trade-${Date.now()}`,
        tradeTeamAbbr,
        createdAt: new Date(),
        outgoingRosterPlayerIds: Array.from(selectedOutgoingRosterIds),
        outgoingPickIds: Array.from(selectedOutgoingPickIds),
        incomingPlayers,
        incomingPicks,
      })
    }
    handleClose()
  }

  function handleClose() {
    setTradeTeamAbbr('')
    setSelectedOutgoingRosterIds(new Set())
    setSelectedOutgoingPickIds(new Set())
    setSelectedIncomingPlayerIds(new Set())
    setSelectedIncomingPickIds(new Set())
    setIncomingCustomPicks([])
    setAddPickYear('2027')
    setAddPickRound('First Round')
    setAddPickNumber('16')
    onClose()
  }

  const canSave =
    !!tradeTeamAbbr &&
    (selectedOutgoingRosterIds.size > 0 ||
      selectedOutgoingPickIds.size > 0 ||
      selectedIncomingPlayerIds.size > 0 ||
      selectedIncomingPickIds.size > 0 ||
      incomingCustomPicks.length > 0)

  const outgoingInTradeCount = selectedOutgoingRosterIds.size + selectedOutgoingPickIds.size
  const incomingInTradeCount = selectedIncomingPlayerIds.size + selectedIncomingPickIds.size + incomingCustomPicks.length

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <DialogHeader className="mb-3">
            <DialogTitle>{editingTrade ? 'Edit Trade' : 'Build Trade'}</DialogTitle>
            <DialogDescription className="sr-only">Select assets to trade with a partner team.</DialogDescription>
          </DialogHeader>

          {/* Team selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">Trade with:</span>
            <Select value={tradeTeamAbbr} onValueChange={setTradeTeamAbbr}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Select a team..." />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map((abbr) => (
                  <SelectItem key={abbr} value={abbr} className="text-sm">
                    {TEAM_NAMES[abbr] || abbr} ({abbr})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-0 border-t border-border">

          {/* ── YOUR SIDE ── */}
          <div className="border-r border-border flex flex-col">
            <div className="px-3 py-2 bg-muted/30 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Side</span>
            </div>

            {/* Available */}
            <SectionLabel>Available — click to add</SectionLabel>
            <div className="h-44 overflow-y-auto p-1.5 space-y-0.5">
              {availableOutgoingRoster.length === 0 && availableOutgoingFAContracts.length === 0 && availableOutgoingPicks.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-2">All assets added to trade</p>
              ) : (
                <>
                  {availableOutgoingRoster.map((p) => (
                    <AvailableRow key={p.id} label={p.name} sub={formatCurrency(getFirstYearSalary(p))} salary={p.salary} options={p.options} onClick={() => addOutgoingRoster(p.id)} />
                  ))}
                  {availableOutgoingFAContracts.map((c) => (
                    <AvailableRow key={c.id} label={c.playerName} sub={formatCurrency(getFirstYearSalary(c))} salary={c.salary} onClick={() => addOutgoingRoster(c.id)} />
                  ))}
                  {availableOutgoingPicks.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] text-muted-foreground/60 px-2 pb-0.5 uppercase tracking-wide">Picks</p>
                      {availableOutgoingPicks.map((p) => (
                        <AvailableRow key={p.id} label={p.name} draftPick={p.draftPick} onClick={() => addOutgoingPick(p.id)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* In Trade */}
            <SectionLabel>
              In trade{outgoingInTradeCount > 0 ? ` · ${outgoingInTradeCount}` : ''}
            </SectionLabel>
            <div className="h-32 overflow-y-auto p-1.5 space-y-1">
              {outgoingInTradeCount === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-2">No assets selected yet</p>
              ) : (
                <>
                  {selectedOutgoingRosterObjects.map((p) => (
                    <TradeChip key={p.id} label={p.name} sub={formatCurrency(getFirstYearSalary(p))} salary={p.salary} options={p.options} onRemove={() => removeOutgoingRoster(p.id)} />
                  ))}
                  {selectedOutgoingFAObjects.map((c) => (
                    <TradeChip key={c.id} label={c.playerName} sub={formatCurrency(getFirstYearSalary(c))} salary={c.salary} onRemove={() => removeOutgoingRoster(c.id)} />
                  ))}
                  {selectedOutgoingPickObjects.map((p) => (
                    <TradeChip key={p.id} label={p.name} draftPick={p.draftPick} onRemove={() => removeOutgoingPick(p.id)} />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ── THEIR SIDE ── */}
          <div className="flex flex-col">
            <div className="px-3 py-2 bg-muted/30 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tradeTeamAbbr ? `${tradeTeamAbbr} Side` : 'Their Side'}
              </span>
            </div>

            {/* Available */}
            <SectionLabel>Available — click to add</SectionLabel>
            <div className="h-44 overflow-y-auto p-1.5 space-y-0.5">
              {!tradeTeamAbbr ? (
                <p className="text-xs text-muted-foreground px-2 py-2">Select a team above</p>
              ) : availableIncomingPlayers.length === 0 && availableIncomingPicks.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-2">All assets added to trade</p>
              ) : (
                <>
                  {availableIncomingPlayers.map((p) => (
                    <AvailableRow key={p.id} label={p.name} sub={formatCurrency(getFirstYearSalary(p))} salary={p.salary} options={p.options} onClick={() => addIncomingPlayer(p.id)} />
                  ))}
                  {availableIncomingPicks.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] text-muted-foreground/60 px-2 pb-0.5 uppercase tracking-wide">Picks</p>
                      {availableIncomingPicks.map((p) => (
                        <AvailableRow key={p.id} label={p.name} draftPick={p.draftPick} onClick={() => addIncomingPick(p.id)} />
                      ))}
                    </div>
                  )}
                </>
              )}
              {/* Custom pick adder — always visible when a team is selected */}
              {tradeTeamAbbr && (
                <div className="pt-2 px-1 border-t border-border/40 mt-1">
                  <p className="text-[10px] text-muted-foreground/70 mb-1 px-1">Add custom pick</p>
                  <div className="flex items-center gap-1">
                    <Select value={addPickYear} onValueChange={setAddPickYear}>
                      <SelectTrigger className="h-6 text-[11px] w-[68px] px-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2026, 2027, 2028, 2029, 2030, 2031, 2032].map((y) => (
                          <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={addPickRound} onValueChange={(v) => setAddPickRound(v as 'First Round' | 'Second Round')}>
                      <SelectTrigger className="h-6 text-[11px] w-[52px] px-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="First Round" className="text-xs">1st</SelectItem>
                        <SelectItem value="Second Round" className="text-xs">2nd</SelectItem>
                      </SelectContent>
                    </Select>
                    {addPickRound === 'First Round' && (
                      <Select value={addPickNumber} onValueChange={setAddPickNumber}>
                        <SelectTrigger className="h-6 text-[11px] w-[52px] px-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={String(n)} className="text-xs">#{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button size="sm" variant="outline" className="h-6 w-6 p-0 shrink-0" onClick={addCustomIncomingPick}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* In Trade */}
            <SectionLabel>
              In trade{incomingInTradeCount > 0 ? ` · ${incomingInTradeCount}` : ''}
            </SectionLabel>
            <div className="h-32 overflow-y-auto p-1.5 space-y-1">
              {incomingInTradeCount === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-2">No assets selected yet</p>
              ) : (
                <>
                  {selectedIncomingPlayerObjects.map((p) => (
                    <TradeChip key={p.id} label={p.name} sub={formatCurrency(getFirstYearSalary(p))} salary={p.salary} options={p.options} onRemove={() => removeIncomingPlayer(p.id)} />
                  ))}
                  {selectedIncomingPickObjects.map((p) => (
                    <TradeChip key={p.id} label={p.name} draftPick={p.draftPick} onRemove={() => removeIncomingPick(p.id)} />
                  ))}
                  {incomingCustomPicks.map((p) => (
                    <TradeChip
                      key={p.id}
                      label={p.name}
                      draftPick={{
                        teamOwner: TEAM_NAMES[p.fromTeam] ?? p.fromTeam,
                        year: p.year,
                        round: p.round,
                        teamFrom: null,
                        swapOwner: null,
                        swapOption: null,
                        protections: null,
                        pickNumber: p.pickNumber,
                        pickPool: null,
                        rank: null,
                      }}
                      onRemove={() => removeCustomPick(p.id)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Validation */}
        {tradeAnalysis && (
          <div className="border-t border-border px-5 py-3 space-y-2.5 max-h-64 overflow-y-auto">
            {/* After this trade — cap status preview */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">After this trade</p>
              {[tradeAnalysis.yourPreview, tradeAnalysis.theirPreview].map((row) => (
                <div key={row.teamAbbr} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium truncate flex items-center gap-1">
                    {row.teamName}
                    {row.approximate && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground font-normal cursor-default underline decoration-dotted underline-offset-2">
                            (est.)
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Based on {row.teamName}&apos;s current roster plus any contracts and trades already built for them in this app — trades built from another team&apos;s perspective, and real-world moves outside this app, aren&apos;t visible here.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
                    <span className="text-muted-foreground">{formatCurrency(row.preTotal)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={row.preStatus !== row.postStatus ? 'font-bold' : ''}>{formatCurrency(row.postTotal)}</span>
                    <span className={cn('text-[10px]', row.delta > 0 ? 'text-red-400' : row.delta < 0 ? 'text-emerald-400' : 'text-muted-foreground')}>
                      ({row.delta >= 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(row.delta))})
                    </span>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', getCapStatusColor(row.preStatus))}>{row.preStatus}</span>
                    {row.preStatus !== row.postStatus && (
                      <>
                        <span className="text-muted-foreground">→</span>
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 ring-current', getCapStatusColor(row.postStatus))}>
                          {row.postStatus}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Trade Invalid */}
            {tradeAnalysis.validation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 space-y-1">
                <p className="text-xs font-semibold text-destructive">Trade Invalid</p>
                {tradeAnalysis.validation.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive-foreground/90">{e.message}</p>
                ))}
              </div>
            )}

            {/* Heads up (warnings) */}
            {tradeAnalysis.validation.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
                <p className="text-xs font-semibold text-amber-500">Heads up</p>
                {tradeAnalysis.validation.warnings.map((w, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className="text-xs text-foreground/90">{w.message}</p>
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

            {tradeAnalysis.validation.errors.length === 0 && tradeAnalysis.validation.warnings.length === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                <Check className="h-3.5 w-3.5" />
                No rule violations detected
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{FIDELITY_NOTE}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3 border-t border-border">
          <Button variant="outline" onClick={handleClose} className="flex-1 h-8 text-sm">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || (tradeAnalysis ? !tradeAnalysis.validation.isValid : false)}
            className="flex-1 h-8 text-sm"
            title={tradeAnalysis && !tradeAnalysis.validation.isValid ? 'Resolve the issues in Trade Invalid to save.' : undefined}
          >
            {editingTrade ? 'Save Changes' : 'Save Trade'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
