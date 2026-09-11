'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Season, SEASONS, SavedTrade, TradeMovement } from '@/lib/types'
import { NormalizedTrade, normalizeTrade, toSavedTrade } from '@/lib/trade-model'
import { getTeamRoster, ALL_TEAMS } from '@/lib/data'
import { getDraftPickPlayers, DraftPick } from '@/lib/draft-picks'
import { getScaledRookieSalary, SECOND_ROUND_SALARY_BY_SEASON } from '@/lib/rookie-salaries'
import type { TradeDraftSnapshot } from '@/lib/gm-chat/types'

// The CBA doesn't cap participants, but past five the columns stop being
// readable and real deals essentially never go further.
export const MAX_TEAMS = 5

export interface PickDraft {
  year: string
  round: 'First Round' | 'Second Round'
  number: string
}

const INITIAL_PICK_DRAFT: PickDraft = { year: '2027', round: 'First Round', number: '16' }

export interface TradeAssetOption {
  id: string
  name: string
  salary: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
}

export function computePickSalary(
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

export function getFirstYearSalary(salary: Partial<Record<Season, number>>) {
  for (const season of SEASONS) {
    if (salary[season]) return salary[season]!
  }
  return 0
}

// Player.id is only unique within one team's roster — it's `player-${idx}`
// per getTeamRoster call, not global (see lib/data.ts). The old two-team
// modal never hit this because "your side" and "their side" lived in
// separate state variables; a 3+ team deal merges every team's assets into
// one flat `movements` array, so two different teams' players can share an
// id (e.g. both happen to be roster index 4). Every dedup/lookup/removal
// below is therefore keyed on the (team, id) pair, never id alone — pick and
// custom-asset ids already embed their team, but treating them the same way
// costs nothing and removes the asymmetry as a place for this bug to return.
export function assetKey(from: string, id: string): string {
  return `${from}::${id}`
}

/**
 * Every bit of trade-builder behavior that isn't layout: participant list,
 * pending movements, which assets each team still has to give, the live
 * validator verdict, and save/reset. The desktop modal and the mobile inline
 * builder both drive their UI from this, so a rule can't be enforced in one
 * surface and not the other.
 *
 * `isActive` mirrors whichever "the builder is open" flag the host owns
 * (dialog open, panel expanded); the draft resets whenever it flips on.
 */
export function useTradeBuilder({
  isActive,
  editingTrade,
  onDone,
  onDraftChange,
}: {
  isActive: boolean
  editingTrade?: SavedTrade
  onDone: () => void
  /** Called whenever the board changes, so a host panel can mirror it. */
  onDraftChange?: (draft: TradeDraftSnapshot | null) => void
}) {
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
  const [pickDraft, setPickDraft] = useState<PickDraft>(INITIAL_PICK_DRAFT)

  useEffect(() => {
    if (!isActive) return
    if (editingTrade) {
      const normalized = normalizeTrade(editingTrade, selectedTeamAbbr)
      setTeams(normalized.teams)
      setMovements(normalized.movements)
    } else {
      setTeams([selectedTeamAbbr])
      setMovements([])
    }
  }, [isActive, editingTrade?.id, selectedTeamAbbr]) // eslint-disable-line react-hooks/exhaustive-deps

  const partners = teams.filter((t) => t !== selectedTeamAbbr)
  const availableTeams = ALL_TEAMS.filter((t) => !teams.includes(t))

  // In edit mode, the trade being edited shouldn't count its own assets as
  // "already traded away" by some other saved trade.
  const editingOwnAssetIds = useMemo(() => {
    if (!editingTrade) return new Set<string>()
    const normalized = normalizeTrade(editingTrade, selectedTeamAbbr)
    return new Set(normalized.movements.filter((m) => m.from === selectedTeamAbbr).map((m) => m.id))
  }, [editingTrade?.id, selectedTeamAbbr]) // eslint-disable-line react-hooks/exhaustive-deps

  const inTradeKeys = useMemo(() => new Set(movements.map((m) => assetKey(m.from, m.id))), [movements])

  function assetsAvailableFor(teamAbbr: string): { players: TradeAssetOption[]; picks: TradeAssetOption[] } {
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
  // guard uses so the builder and the data layer can never disagree.
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

  function reset() {
    setMovements([])
  }

  function close() {
    setTeams([selectedTeamAbbr])
    setMovements([])
    setAddTeamValue('')
    setPickDraft(INITIAL_PICK_DRAFT)
    onDone()
  }

  function save() {
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
    close()
  }

  // Resolves a pick's protection/swap detail for a hover card. Deliberately
  // not the "available" list, which excludes anything already in a tray —
  // exactly the picks this needs to describe.
  function draftPickFor(teamAbbr: string, pickId: string): DraftPick | undefined {
    const source = teamAbbr === selectedTeamAbbr ? draftPickPlayers : getDraftPickPlayers(teamAbbr)
    return source.find((p) => p.id === pickId)?.draftPick
  }

  const canSave = partners.length > 0 && movements.length > 0
  const isValid = analysis ? analysis.validation.isValid : true

  // A plain-text view of the deal on the board, for the trade panel's chat
  // assistant (lib/gm-chat/focus.ts). Built here rather than in the panel so
  // the desktop and mobile builders hand up the identical snapshot.
  //
  // Keyed on its own serialization rather than on `analysis`: analyzeTrade
  // closes over live roster state and returns a fresh object every render, so
  // memoizing on it would hand the host a new snapshot each pass — and since
  // the host stores that in state, that is an infinite render loop.
  const draftKey = (() => {
    if (movements.length === 0) return ''
    const ownSide = analysis?.sides.find((side) => side.teamAbbr === selectedTeamAbbr)
    const season = analysis?.season ?? SEASONS[0]
    const sum = (assets: { salaryBySeason: Partial<Record<Season, number>> }[] | undefined) =>
      (assets ?? []).reduce((total, asset) => total + (asset.salaryBySeason[season] ?? 0), 0)

    const snapshot: TradeDraftSnapshot = {
      teams,
      legs: movements.map((m) =>
        m.kind === 'cash'
          ? `$${(m.amount ?? 0).toLocaleString()} cash ${m.from} to ${m.to}`
          : `${m.name ?? m.id} ${m.from} to ${m.to}`
      ),
      outgoingTotal: sum(ownSide?.outgoing),
      incomingTotal: sum(ownSide?.incoming),
      isValid,
      errors: (analysis?.validation.errors ?? []).map((v) => v.message),
      warnings: (analysis?.validation.warnings ?? []).map((v) => v.message),
    }
    return JSON.stringify(snapshot)
  })()

  const draftSnapshot: TradeDraftSnapshot | null = useMemo(
    () => (draftKey ? (JSON.parse(draftKey) as TradeDraftSnapshot) : null),
    [draftKey]
  )

  // Hand it up only when the deal actually changed, so the panel hosting the
  // builder can pass the live board to its chat without re-deriving any of it.
  useEffect(() => {
    onDraftChange?.(draftSnapshot)
  }, [draftSnapshot, onDraftChange])

  return {
    selectedTeamAbbr,
    teams,
    partners,
    availableTeams,
    movements,
    addTeamValue,
    setAddTeamValue,
    pickDraft,
    setPickDraft,
    assetsAvailableFor,
    defaultDestination,
    addMovement,
    removeMovement,
    updateMovement,
    addTeam,
    removeTeam,
    addCustomPick,
    addCashLeg,
    draftPickFor,
    analysis,
    canSave,
    isValid,
    reset,
    save,
    close,
    draftSnapshot,
  }
}
