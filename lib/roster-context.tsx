'use client'

import { useState, createContext, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react'
import { Player, SavedContract, SavedTrade, Season, SEASONS, CapSheet, CapSheetSnapshot, CapSheetSummary, SeasonGuarantee, ReleaseDetail } from './types'
import { getTeamRoster, TEAMS, CAP_THRESHOLDS, getCapStatus, findPlayerHomeTeam } from './data'
import { getDraftPickPlayers, applyPickNumberOverrides, DraftPickPlayer } from './draft-picks'
import { getPlayerRookieYear, getPlayerYOE, getDisplayedSeasons } from './contract-utils'
import { getContractDetail } from './contract-details'
import { getTeamCapState, CapHold, DeadMoney } from './team-cap-state'
import { getCurrentSeason, guaranteeLockDate, SEASON_CALENDAR } from './season-calendar'
import {
  TradeAsset,
  TradeSideInput,
  validateTrade,
  getOwnedFirstRoundYears,
  parsePickIdMeta,
  TRADE_EVAL_SEASON,
  CURRENT_DRAFT_YEAR,
} from './trade-validation'

// schema doc §1 — a player's years of service, for the per-YOS minimum-salary
// lookup in league-cap.ts. Approximated against TRADE_EVAL_SEASON since a
// TradeAsset is built once, before the trade's actual eval season is known;
// undefined for anyone missing from PLAYER_ROOKIE_YEARS (falls back safely).
function yearsOfServiceFor(playerName: string): number | undefined {
  const rookieYear = getPlayerRookieYear(playerName)
  return rookieYear !== undefined ? getPlayerYOE(rookieYear, TRADE_EVAL_SEASON) : undefined
}

// Hoops Rumors' guarantee-status articles only get re-scraped when the
// source republishes, so a 'partial'/'non-guaranteed' status can sit stale
// well past its own guaranteeDate. Once that date has passed, the season is
// fully guaranteed regardless of what the stored status still says. Same
// treatment for the CBA's own January 10 lock-in date (see
// season-calendar.ts's guaranteeLockDate) when a season is supplied — that
// applies even to contracts with no guaranteeDate on file at all.
export function effectiveGuarantee(g: SeasonGuarantee, today: Date = new Date(), season?: Season): SeasonGuarantee {
  if (g.status === 'full') return g
  if (g.guaranteeDate && new Date(g.guaranteeDate) <= today) return { status: 'full' }
  if (season && today >= new Date(guaranteeLockDate(season))) return { status: 'full' }
  return g
}

// schema doc §2a — converts a player's per-season guarantee status into the
// discounted "counts toward the match" amount. Returns undefined (no discount,
// full salary counts) whenever the player has no guarantee data for that
// season — most players, since only Hoops Rumors' partial/non-guaranteed
// cases are sourced into Player.guarantees.
function guaranteedBySeasonFor(player: Player, getSalary: (p: Player, s: Season) => number): Partial<Record<Season, number>> | undefined {
  if (!player.guarantees) return undefined
  const result: Partial<Record<Season, number>> = {}
  SEASONS.forEach((s) => {
    const raw = player.guarantees?.[s]
    if (!raw) return
    const g = effectiveGuarantee(raw, new Date(), s)
    if (g.status === 'full') return // absent, full, or past its guaranteeDate/lock date — full salary counts
    result[s] = g.status === 'non-guaranteed' ? 0 : (g.amount ?? 0)
  })
  return Object.keys(result).length > 0 ? result : undefined
}

// A regular season year is always treated as 174 days for this formula,
// regardless of the actual per-season game calendar — see the real CBA rule
// below.
const REGULAR_SEASON_DAYS = 174

// Full salary unless the season has guarantee data on file, in which case it's
// capped at whatever's actually guaranteed as of `asOf` (0 for non-guaranteed,
// the stored amount for partial) — except that a non-guaranteed/partial
// player cut in-season (after the season starts, before the Jan 10 lock)
// still accrues a real per-day charge under the CBA: salary ÷ 174 regular-
// season days × days already spent on the roster, with the guaranteed floor
// as a backstop if that's larger. Cutting him before the season starts still
// carries no per-day charge — only the guaranteed floor applies. Waiving
// doesn't erase any of this — it's what becomes dead money below. Exported
// so the release-date UI can preview it.
export function guaranteedAmountForSeason(player: Player, season: Season, effectiveSalary: number, asOf: Date = new Date()): number {
  const raw = player.guarantees?.[season]
  if (!raw) return effectiveSalary
  const g = effectiveGuarantee(raw, asOf, season)
  if (g.status === 'full') return effectiveSalary
  const floor = g.status === 'non-guaranteed' ? 0 : Math.min(g.amount ?? 0, effectiveSalary)

  const seasonStart = SEASON_CALENDAR[season]?.seasonStart
  if (!seasonStart || asOf <= new Date(seasonStart)) return floor

  const daysOnRoster = Math.floor((asOf.getTime() - new Date(seasonStart).getTime()) / 86_400_000)
  const perDiemCharge = (effectiveSalary / REGULAR_SEASON_DAYS) * daysOnRoster
  return Math.min(effectiveSalary, Math.max(floor, perDiemCharge))
}

// Releasing a player is modeled as waiving them on a chosen date (defaults to
// today) — their guaranteed salary for whatever league year that date falls
// in becomes dead money exactly like a real waiver, rather than just
// vanishing. A predicted waiver claim (detail.claimed) transfers the whole
// contract away instead, so it's excluded entirely — real waiver claims
// leave zero dead money behind. Only the release's own season is charged;
// multi-year guarantees on later seasons aren't modeled yet, so those
// columns just drop the salary entirely.
function releaseDeadMoneyEntries(
  teamRoster: Player[],
  releaseDetails: Record<string, ReleaseDetail>,
  season: Season,
  getEffectiveSalary: (p: Player, s: Season) => number
): DeadMoney[] {
  return teamRoster
    .filter((p) => {
      const detail = releaseDetails[p.id]
      if (!detail || detail.claimed) return false
      return getCurrentSeason(new Date(detail.date)) === season
    })
    .map((p) => {
      const detail = releaseDetails[p.id]
      return { player: p.name, amount: guaranteedAmountForSeason(p, season, getEffectiveSalary(p, season), new Date(detail.date)) }
    })
    .filter((d) => d.amount > 0)
}

// Team Salary (cap-space total) and Apron Team Salary are two different
// numbers under the CBA — see schema doc §3a. Cap holds count toward Team
// Salary by default (the user renounces them explicitly) but never toward
// Apron Team Salary; the apron total instead adds back the scraped
// unlikely-incentive addon, which cap holds never include. Dead money counts
// toward both — it's a real, unavoidable cap hit regardless of roster
// choices or FA-hold resolution. releaseDeadMoney (waived-today, computed
// above) counts toward both for the same reason.
function apronAddon(teamAbbr: string, season: Season, releaseDeadMoney: number): number {
  const state = getTeamCapState(teamAbbr, season)
  const scrapedDeadMoney = state ? state.deadMoney.reduce((sum, d) => sum + d.amount, 0) : 0
  return scrapedDeadMoney + (state?.apronAddon ?? 0) + releaseDeadMoney
}

// Older saved cap sheets only have releasedRosterIds (no per-player date or
// claim prediction) — treat those as if released today, unclaimed.
function releaseDetailsFromSnapshot(snapshot: { releasedRosterIds: string[]; releaseDetails?: Record<string, ReleaseDetail> }): Record<string, ReleaseDetail> {
  if (snapshot.releaseDetails) return snapshot.releaseDetails
  const today = new Date().toISOString().slice(0, 10)
  const result: Record<string, ReleaseDetail> = {}
  snapshot.releasedRosterIds.forEach((id) => { result[id] = { date: today, claimed: false } })
  return result
}

function renouncedCapHoldKey(teamAbbr: string, season: Season, label: string): string {
  return `${teamAbbr}-${season}-${label}`
}

interface RosterState {
  selectedTeamAbbr: string
  roster: Player[]
  savedContracts: SavedContract[]
  exercisedTeamOptions: Set<string> // player-id-season keys
  exercisedPlayerOptions: Set<string> // player-id-season keys (declined = in set; absent = exercised)
  renouncedCapHolds: Set<string> // `${teamAbbr}-${season}-${holdLabel}` keys
  hasUnsavedChanges: boolean
  activeCapSheet: { id: string; name: string } | null
  pendingSaveIntent: boolean
}

const AUTH_REDIRECT_DRAFT_KEY = 'nba-roster-builder:pending-cap-sheet-draft'

interface AuthRedirectDraft {
  teamAbbr: string
  snapshot: CapSheetSnapshot
  pendingSaveIntent: boolean
}

// Google sign-in is a full-page redirect through /auth/callback (see that
// route's NextResponse.redirect), which wipes all in-memory React state.
// persistDraftForAuthRedirect stashes the working cap sheet here right before
// the redirect so it — and the intent to reopen the save-name dialog, if any
// — survives the round trip. Restored (and cleared) by the mount effect below.
function readAuthRedirectDraft(): AuthRedirectDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(AUTH_REDIRECT_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as AuthRedirectDraft) : null
  } catch {
    return null
  }
}

function clearAuthRedirectDraft() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(AUTH_REDIRECT_DRAFT_KEY)
}

interface RosterContextType extends RosterState {
  selectedTeam: { name: string; city: string; primaryColor: string; secondaryColor: string }
  setSelectedTeamAbbr: (abbr: string) => void
  addSavedContract: (contract: SavedContract) => void
  removeSavedContract: (id: string) => void
  updateSavedContract: (contract: SavedContract) => void
  getPendingOfferSheets: (teamAbbr: string) => Array<{ contract: SavedContract; fromTeam: string }>
  matchOfferSheet: (offerSheetContract: SavedContract, fromTeamAbbr: string) => void
  declineOfferSheet: (offerSheetContract: SavedContract, fromTeamAbbr: string) => void
  toggleTeamOption: (playerId: string, season: Season, exercise: boolean) => void
  togglePlayerOption: (playerId: string, season: Season, exercise: boolean) => void
  getEffectiveSalary: (player: Player, season: Season) => number
  isOptionExercised: (playerId: string, season: Season, optionType: 'Team' | 'Player') => boolean | null
  getTotalSalary: (season: Season) => { current: number; saved: number; capSpaceTotal: number; apronTotal: number }
  getTeamCapTotal: (teamAbbr: string, season: Season) => { capSpaceTotal: number; apronTotal: number }
  getUnresolvedCapHolds: (teamAbbr: string, season: Season) => CapHold[]
  getReleaseDeadMoney: (teamAbbr: string, season: Season) => DeadMoney[]
  renounceCapHold: (teamAbbr: string, season: Season, label: string) => void
  restoreCapHold: (teamAbbr: string, season: Season, label: string) => void
  isCapHoldRenounced: (teamAbbr: string, season: Season, label: string) => boolean
  getDisplaySalary: (player: Player, season: Season) => number
  setDeletedContractIds: (ids: Set<string>) => void
  deletedContractIds: Set<string>
  draftPickPlayers: DraftPickPlayer[]
  pickNumberOverrides: Record<string, number>
  setPickNumberOverride: (pickId: string, pickNumber: number | null) => void
  releasedRosterIds: Set<string>
  releaseDetails: Record<string, ReleaseDetail>
  getReleaseDetail: (playerId: string) => ReleaseDetail | undefined
  releaseRosterPlayer: (playerId: string, date?: string) => void
  setReleaseDetail: (playerId: string, detail: ReleaseDetail) => void
  restoreRosterPlayer: (playerId: string) => void
  savedTrades: SavedTrade[]
  addSavedTrade: (trade: SavedTrade) => void
  removeSavedTrade: (id: string) => void
  updateSavedTrade: (trade: SavedTrade) => void
  tradedRosterPlayerIds: Set<string>
  tradedPickIds: Set<string>
  buildCapSheetPayload: () => { snapshot: CapSheetSnapshot; summary: CapSheetSummary }
  markCapSheetSaved: (sheet: { id: string; name: string }) => void
  loadCapSheet: (sheet: CapSheet) => void
  startNewCapSheet: () => void
  persistDraftForAuthRedirect: (pendingSaveIntent: boolean) => void
  consumePendingSaveIntent: () => void
}

const RosterContext = createContext<RosterContextType | null>(null)

export function RosterProvider({ children }: { children: ReactNode }) {
  const [selectedTeamAbbr, setSelectedTeamAbbrState] = useState<string>('BOS')
  const [savedContractsByTeam, setSavedContractsByTeam] = useState<Record<string, SavedContract[]>>({})
  const [exercisedTeamOptions, setExercisedTeamOptions] = useState<Set<string>>(new Set())
  const [exercisedPlayerOptions, setExercisedPlayerOptions] = useState<Set<string>>(new Set())
  const [renouncedCapHolds, setRenouncedCapHolds] = useState<Set<string>>(new Set())
  const [deletedContractIds, setDeletedContractIds] = useState<Set<string>>(new Set())
  const [releaseDetails, setReleaseDetails] = useState<Record<string, ReleaseDetail>>({})
  const releasedRosterIds = useMemo(() => new Set(Object.keys(releaseDetails)), [releaseDetails])
  const [pickNumberOverrides, setPickNumberOverrides] = useState<Record<string, number>>({})
  const [savedTradesByTeam, setSavedTradesByTeam] = useState<Record<string, SavedTrade[]>>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [activeCapSheet, setActiveCapSheet] = useState<{ id: string; name: string } | null>(null)
  const [pendingSaveIntent, setPendingSaveIntent] = useState(false)

  // sessionStorage is only readable client-side, so this can't happen during
  // the initial (possibly server-rendered) render without a hydration
  // mismatch — restore one tick after mount instead, the same way any
  // client-only persisted state has to be picked up in an SSR app.
  useEffect(() => {
    const draft = readAuthRedirectDraft()
    if (!draft) return
    const { teamAbbr, snapshot } = draft
    setSelectedTeamAbbrState(teamAbbr)
    setSavedContractsByTeam((prev) => ({ ...prev, [teamAbbr]: snapshot.savedContracts }))
    setSavedTradesByTeam((prev) => ({ ...prev, [teamAbbr]: snapshot.savedTrades }))
    setExercisedTeamOptions(new Set(snapshot.exercisedTeamOptionKeys))
    setExercisedPlayerOptions(new Set(snapshot.exercisedPlayerOptionKeys))
    setRenouncedCapHolds(new Set(snapshot.renouncedCapHoldKeys ?? []))
    setDeletedContractIds(new Set(snapshot.deletedContractIds))
    setReleaseDetails(releaseDetailsFromSnapshot(snapshot))
    setPickNumberOverrides({ ...snapshot.pickNumberOverrides })
    setHasUnsavedChanges(true)
    setPendingSaveIntent(draft.pendingSaveIntent)
    clearAuthRedirectDraft()
  }, [])

  const markChanged = useCallback(() => setHasUnsavedChanges(true), [])

  // A fresh team selection starts with its "Save Cap Sheet" button greyed out
  // and no longer tied to whatever saved sheet you were last editing — see
  // the Save Cap Sheet button's disabled/label state in save-cap-sheet-modal.tsx.
  const setSelectedTeamAbbr = useCallback((abbr: string) => {
    setSelectedTeamAbbrState(abbr)
    setHasUnsavedChanges(false)
    setActiveCapSheet(null)
  }, [])

  const setPickNumberOverride = (pickId: string, pickNumber: number | null) => {
    setPickNumberOverrides((prev) => {
      const next = { ...prev }
      if (pickNumber === null) {
        delete next[pickId]
      } else {
        next[pickId] = pickNumber
      }
      return next
    })
    markChanged()
  }

  const roster = useMemo(() => getTeamRoster(selectedTeamAbbr), [selectedTeamAbbr])

  const draftPickPlayers = useMemo(
    () => applyPickNumberOverrides(getDraftPickPlayers(selectedTeamAbbr), pickNumberOverrides),
    [selectedTeamAbbr, pickNumberOverrides]
  )
  const selectedTeam = TEAMS[selectedTeamAbbr] || { name: 'Unknown', city: 'Unknown', primaryColor: '#000', secondaryColor: '#fff' }
  
  // Get saved contracts for the current team
  const savedContracts = savedContractsByTeam[selectedTeamAbbr] || []

  // Get saved trades for the current team
  const savedTrades = savedTradesByTeam[selectedTeamAbbr] || []

  const tradedRosterPlayerIds = useMemo(() => {
    const ids = new Set<string>()
    savedTrades.forEach((t) => t.outgoingRosterPlayerIds.forEach((id) => ids.add(id)))
    return ids
  }, [savedTrades])

  const tradedPickIds = useMemo(() => {
    const ids = new Set<string>()
    savedTrades.forEach((t) => t.outgoingPickIds.forEach((id) => ids.add(id)))
    return ids
  }, [savedTrades])

  // Defense-in-depth: re-run the same validator the trade modal uses before
  // ever committing a trade to state, so an invalid trade can't be saved even
  // if the UI's gating were somehow bypassed. The modal is the primary UX —
  // this only guards the data layer and no-ops (with a console warning) on
  // a hard violation rather than throwing.
  function resolveOutgoingAssets(trade: SavedTrade): TradeAsset[] {
    const assets: TradeAsset[] = []
    trade.outgoingRosterPlayerIds.forEach((id) => {
      const player = roster.find((p) => p.id === id)
      if (player) {
        const salaryBySeason: Partial<Record<Season, number>> = {}
        SEASONS.forEach((s) => {
          const v = getEffectiveSalary(player, s)
          if (v > 0) salaryBySeason[s] = v
        })
        const detail = getContractDetail(player.name)
        assets.push({
          kind: 'player',
          id: player.id,
          name: player.name,
          salaryBySeason,
          yearsOfService: yearsOfServiceFor(player.name),
          guaranteedBySeason: guaranteedBySeasonFor(player, getEffectiveSalary),
          tradeBonusPct: detail?.tradeBonusPct,
          noTradeClause: detail?.noTradeClause,
        })
        return
      }
      const contract = savedContracts.find((c) => c.id === id && !deletedContractIds.has(c.id))
      if (contract) {
        const detail = getContractDetail(contract.playerName)
        assets.push({
          kind: 'player',
          id: contract.id,
          name: contract.playerName,
          salaryBySeason: contract.salary,
          isMinimum: contract.isMinimum || detail?.signedUnder === 'minimum' || undefined,
          yearsOfService: yearsOfServiceFor(contract.playerName),
          tradeBonusPct: detail?.tradeBonusPct,
          noTradeClause: detail?.noTradeClause,
        })
      }
    })
    trade.outgoingPickIds.forEach((id) => {
      const pick = draftPickPlayers.find((p) => p.id === id)
      if (pick) {
        const { pickYear, pickRound } = parsePickIdMeta(id)
        assets.push({ kind: 'pick', id: pick.id, name: pick.name, salaryBySeason: pick.salary, pickYear, pickRound, pick: pick.draftPick })
      }
    })
    return assets
  }

  function resolveIncomingAssets(trade: SavedTrade): TradeAsset[] {
    const players: TradeAsset[] = trade.incomingPlayers.map((p) => {
      const detail = getContractDetail(p.playerName)
      return {
        kind: 'player',
        id: p.playerId,
        name: p.playerName,
        salaryBySeason: p.salary,
        yearsOfService: yearsOfServiceFor(p.playerName),
        tradeBonusPct: detail?.tradeBonusPct,
        noTradeClause: detail?.noTradeClause,
        heldTpeId: p.heldTpeId,
      }
    })
    const picks: TradeAsset[] = trade.incomingPicks.map((p) => {
      const { pickYear, pickRound } = parsePickIdMeta(p.id)
      return { kind: 'pick', id: p.id, name: p.name, salaryBySeason: p.salary, pickYear, pickRound }
    })
    return [...players, ...picks]
  }

  function isTradeValid(trade: SavedTrade): boolean {
    const yourOutgoing = resolveOutgoingAssets(trade)
    const yourIncoming = resolveIncomingAssets(trade)

    // Eval season = earliest season at/after TRADE_EVAL_SEASON any traded
    // player asset carries salary in — see the matching comment in trade-modal.tsx.
    const allPlayerAssets = [...yourOutgoing, ...yourIncoming].filter((a) => a.kind === 'player')
    const seasonsFromEval = SEASONS.slice(SEASONS.indexOf(TRADE_EVAL_SEASON))
    const season: Season =
      seasonsFromEval.find((s) => allPlayerAssets.some((a) => (a.salaryBySeason[s] ?? 0) > 0)) ?? TRADE_EVAL_SEASON
    const thresholds = CAP_THRESHOLDS[season]

    const yourPreTradeTotal = getTotalSalary(season).capSpaceTotal
    const theirPreTradeTotal = getTeamCapTotal(trade.tradeTeamAbbr, season).capSpaceTotal
    const yourCapState = getTeamCapState(selectedTeamAbbr, TRADE_EVAL_SEASON)
    const theirCapState = getTeamCapState(trade.tradeTeamAbbr, TRADE_EVAL_SEASON)

    const yourSide: TradeSideInput = {
      side: 'yours',
      teamAbbr: selectedTeamAbbr,
      teamName: TEAMS[selectedTeamAbbr]?.name ?? selectedTeamAbbr,
      preTradeTotal: yourPreTradeTotal,
      approximate: false,
      outgoing: yourOutgoing,
      incoming: yourIncoming,
      heldTPEs: yourCapState?.heldTPEs ?? [],
      cashOut: trade.cashToPartner,
      cashIn: trade.cashFromPartner,
      cashLedger: yourCapState?.cashLedger,
    }
    const theirSide: TradeSideInput = {
      side: 'theirs',
      teamAbbr: trade.tradeTeamAbbr,
      teamName: TEAMS[trade.tradeTeamAbbr]?.name ?? trade.tradeTeamAbbr,
      preTradeTotal: theirPreTradeTotal,
      approximate: true,
      outgoing: yourIncoming,
      incoming: yourOutgoing,
      heldTPEs: theirCapState?.heldTPEs ?? [],
      cashOut: trade.cashFromPartner,
      cashIn: trade.cashToPartner,
      cashLedger: theirCapState?.cashLedger,
    }

    const validation = validateTrade({
      season,
      thresholds,
      currentDraftYear: CURRENT_DRAFT_YEAR,
      sides: [yourSide, theirSide],
      ownedFirstRoundYearsByTeam: {
        [selectedTeamAbbr]: getOwnedFirstRoundYears(selectedTeamAbbr),
        [trade.tradeTeamAbbr]: getOwnedFirstRoundYears(trade.tradeTeamAbbr),
      },
    })

    return validation.isValid
  }

  const addSavedTrade = useCallback((trade: SavedTrade) => {
    if (!isTradeValid(trade)) {
      console.warn('Refusing to save invalid trade', trade.id)
      return
    }
    setSavedTradesByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: [...(prev[selectedTeamAbbr] || []), trade],
    }))
    markChanged()
  }, [selectedTeamAbbr, roster, draftPickPlayers, savedContracts, deletedContractIds])

  const removeSavedTrade = useCallback((id: string) => {
    setSavedTradesByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).filter((t) => t.id !== id),
    }))
    markChanged()
  }, [selectedTeamAbbr])

  const updateSavedTrade = useCallback((trade: SavedTrade) => {
    if (!isTradeValid(trade)) {
      console.warn('Refusing to save invalid trade', trade.id)
      return
    }
    setSavedTradesByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).map((t) => t.id === trade.id ? trade : t),
    }))
    markChanged()
  }, [selectedTeamAbbr, roster, draftPickPlayers, savedContracts, deletedContractIds])

  const addSavedContract = (contract: SavedContract) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: [...(prev[selectedTeamAbbr] || []), contract],
    }))
    markChanged()
  }

  const releaseRosterPlayer = (playerId: string, date: string = new Date().toISOString().slice(0, 10)) => {
    setReleaseDetails((prev) => ({ ...prev, [playerId]: { date, claimed: false } }))
    markChanged()
  }

  const setReleaseDetail = (playerId: string, detail: ReleaseDetail) => {
    setReleaseDetails((prev) => ({ ...prev, [playerId]: detail }))
    markChanged()
  }

  const getReleaseDetail = useCallback((playerId: string): ReleaseDetail | undefined => releaseDetails[playerId], [releaseDetails])

  const restoreRosterPlayer = (playerId: string) => {
    setReleaseDetails((prev) => {
      const next = { ...prev }
      delete next[playerId]
      return next
    })
    markChanged()
  }

  const removeSavedContract = (id: string) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).filter((c) => c.id !== id),
    }))
    markChanged()
  }

  const updateSavedContract = (contract: SavedContract) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).map((c) => c.id === contract.id ? contract : c),
    }))
    markChanged()
  }

  // Offer sheets are saved under the *offering* team, tagged rfaPath
  // 'offer-sheet' — this scans every team's saved contracts for ones whose
  // player's original team (resolved by name, since Player.id isn't globally
  // unique — see findPlayerHomeTeam) is teamAbbr, so the original team sees
  // pending offer sheets against its own free agents regardless of which
  // team is currently selected.
  const getPendingOfferSheets = useCallback((teamAbbr: string): Array<{ contract: SavedContract; fromTeam: string }> => {
    const results: Array<{ contract: SavedContract; fromTeam: string }> = []
    Object.entries(savedContractsByTeam).forEach(([fromTeam, contracts]) => {
      if (fromTeam === teamAbbr) return
      contracts.forEach((contract) => {
        if (contract.rfaPath === 'offer-sheet' && findPlayerHomeTeam(contract.playerName) === teamAbbr) {
          results.push({ contract, fromTeam })
        }
      })
    })
    return results
  }, [savedContractsByTeam])

  // Matching copies the offer sheet's terms onto the original team as a new
  // contract and removes the pending offer sheet from the offering team — it
  // never happened. The 1-year no-trade/no-amend restriction that comes with
  // a match is display-only (see roster-table.tsx's badge), not enforced here.
  const matchOfferSheet = useCallback((offerSheetContract: SavedContract, fromTeamAbbr: string) => {
    const matchedContract: SavedContract = {
      ...offerSheetContract,
      id: `ext-${offerSheetContract.playerId}-${Date.now()}`,
      type: 'extension',
      rfaPath: 'matched-offer-sheet',
    }
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: [...(prev[selectedTeamAbbr] || []), matchedContract],
      [fromTeamAbbr]: (prev[fromTeamAbbr] || []).filter((c) => c.id !== offerSheetContract.id),
    }))
    markChanged()
  }, [selectedTeamAbbr, markChanged])

  // Declining just clears the pending flag — the contract stays on the
  // offering team as an ordinary finalized signing.
  const declineOfferSheet = useCallback((offerSheetContract: SavedContract, fromTeamAbbr: string) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [fromTeamAbbr]: (prev[fromTeamAbbr] || []).map((c) =>
        c.id === offerSheetContract.id ? { ...c, rfaPath: undefined } : c
      ),
    }))
    markChanged()
  }, [markChanged])

  // exercise = true means keep the salary, false means decline (salary becomes 0)
  const toggleTeamOption = (playerId: string, season: Season, exercise: boolean) => {
    markChanged()
    const key = `declined-${playerId}-${season}`
    setExercisedTeamOptions((prev) => {
      const next = new Set(prev)
      if (exercise) {
        // Remove from declined set (option is exercised)
        next.delete(key)
      } else {
        // Add to declined set (option is declined)
        next.add(key)
        
        // If declining a team option, automatically decline all subsequent team options for this player
        const currentSeasonIndex = SEASONS.indexOf(season)
        const player = roster.find(p => p.id === playerId)
        
        if (player) {
          // Check all future seasons for team options
          for (let i = currentSeasonIndex + 1; i < SEASONS.length; i++) {
            const futureSeasonKey = `declined-${playerId}-${SEASONS[i]}`
            if (player.options[SEASONS[i]] === 'Team') {
              next.add(futureSeasonKey)
            }
          }
        }
      }
      return next
    })
  }

  const togglePlayerOption = (playerId: string, season: Season, exercise: boolean) => {
    markChanged()
    const key = `declined-${playerId}-${season}`
    setExercisedPlayerOptions((prev) => {
      const next = new Set(prev)
      if (exercise) {
        // Remove from declined set (player exercises option)
        next.delete(key)
      } else {
        // Add to declined set (player declines option)
        next.add(key)
      }
      return next
    })
  }

  // Returns true if exercised (default), false if explicitly declined
  const isOptionExercised = (playerId: string, season: Season, optionType: 'Team' | 'Player'): boolean => {
    const key = `declined-${playerId}-${season}`
    if (optionType === 'Team') {
      // Default is exercised, so return false only if in declined set
      return !exercisedTeamOptions.has(key)
    } else {
      return !exercisedPlayerOptions.has(key)
    }
  }

  // Cap holds are auto-suppressed once the player they represent already has
  // a real signed salary that season — on the roster, in savedContracts, or
  // via a trade — so a re-signed player doesn't double-count. Only
  // kind: 'free-agent' holds are ever suppressed or renounceable;
  // empty-roster and draft-pick holds are structural cap charges.
  function unresolvedCapHolds(teamAbbr: string, season: Season, teamRoster: Player[], teamSavedContracts: SavedContract[]): CapHold[] {
    const state = getTeamCapState(teamAbbr, season)
    if (!state) return []
    const signedNames = new Set([
      ...teamRoster.filter((p) => !!getEffectiveSalary(p, season)).map((p) => p.name),
      ...teamSavedContracts.filter((c) => !!c.salary[season]).map((c) => c.playerName),
    ])
    return state.capHolds.filter((hold) => hold.kind !== 'free-agent' || !signedNames.has(hold.label))
  }

  function capSpaceAddon(teamAbbr: string, season: Season, teamRoster: Player[], teamSavedContracts: SavedContract[], releaseDeadMoney: number): number {
    const state = getTeamCapState(teamAbbr, season)
    const deadMoney = state ? state.deadMoney.reduce((sum, d) => sum + d.amount, 0) : 0
    const holds = state
      ? unresolvedCapHolds(teamAbbr, season, teamRoster, teamSavedContracts)
          .filter((h) => h.kind !== 'free-agent' || !renouncedCapHolds.has(renouncedCapHoldKey(teamAbbr, season, h.label)))
          .reduce((sum, h) => sum + h.amount, 0)
      : 0
    return deadMoney + holds + releaseDeadMoney
  }

  const getUnresolvedCapHolds = useCallback((teamAbbr: string, season: Season): CapHold[] => {
    const teamRoster = teamAbbr === selectedTeamAbbr ? roster : getTeamRoster(teamAbbr)
    const teamSavedContracts = savedContractsByTeam[teamAbbr] || []
    return unresolvedCapHolds(teamAbbr, season, teamRoster, teamSavedContracts)
  }, [selectedTeamAbbr, roster, savedContractsByTeam, exercisedTeamOptions, exercisedPlayerOptions])

  const isCapHoldRenounced = useCallback((teamAbbr: string, season: Season, label: string): boolean => {
    return renouncedCapHolds.has(renouncedCapHoldKey(teamAbbr, season, label))
  }, [renouncedCapHolds])

  const renounceCapHold = useCallback((teamAbbr: string, season: Season, label: string) => {
    setRenouncedCapHolds((prev) => new Set(prev).add(renouncedCapHoldKey(teamAbbr, season, label)))
    markChanged()
  }, [markChanged])

  const restoreCapHold = useCallback((teamAbbr: string, season: Season, label: string) => {
    setRenouncedCapHolds((prev) => {
      const next = new Set(prev)
      next.delete(renouncedCapHoldKey(teamAbbr, season, label))
      return next
    })
    markChanged()
  }, [markChanged])

  const getEffectiveSalary = (player: Player, season: Season): number => {
    // Two-way salary is real (it's what makes the free-agent panel correctly
    // treat a two-way signee as already employed), but it never counts
    // toward Team Salary — same exclusion SavedContract.contractType
    // 'two-way' already gets in getTotalSalary/getTeamCapTotal below.
    if (player.contractType === 'two-way') return 0

    const salary = player.salary[season]
    if (!salary) return 0

    const optionType = player.options[season]
    if (!optionType) return salary

    const key = `${player.id}-${season}`
    
    // Both Team and Player options default to EXERCISED
    // User can explicitly decline by adding to the declined set
    if (optionType === 'Team') {
      // Check if explicitly declined
      return exercisedTeamOptions.has(`declined-${key}`) ? 0 : salary
    }
    
    if (optionType === 'Player') {
      // Check if explicitly declined
      return exercisedPlayerOptions.has(`declined-${key}`) ? 0 : salary
    }

    return salary
  }

  const getTotalSalary = (season: Season) => {
    const currentSalary = roster
      .filter((player) => !releasedRosterIds.has(player.id) && !tradedRosterPlayerIds.has(player.id))
      .reduce((sum, player) => sum + getEffectiveSalary(player, season), 0)
    const savedSalary = savedContracts
      .filter((contract) => !deletedContractIds.has(contract.id) && contract.contractType !== 'two-way')
      .reduce((sum, contract) => sum + (contract.salary[season] || 0), 0)
    const draftSalary = draftPickPlayers
      .filter((pick) => !tradedPickIds.has(pick.id))
      .reduce((sum, pick) => sum + (pick.salary[season] || 0), 0)
    const tradeIncomingPlayerSalary = savedTrades.reduce((sum, trade) => {
      return sum + trade.incomingPlayers.reduce((s, p) => s + (p.salary[season] || 0), 0)
    }, 0)
    const tradeIncomingPickSalary = savedTrades.reduce((sum, trade) => {
      return sum + trade.incomingPicks.reduce((s, p) => s + (p.salary[season] || 0), 0)
    }, 0)

    const base = currentSalary + savedSalary + draftSalary + tradeIncomingPlayerSalary + tradeIncomingPickSalary
    const releaseDeadMoney = releaseDeadMoneyEntries(roster, releaseDetails, season, getEffectiveSalary)
      .reduce((sum, d) => sum + d.amount, 0)

    return {
      current: currentSalary,
      saved: savedSalary,
      capSpaceTotal: base + capSpaceAddon(selectedTeamAbbr, season, roster, savedContracts, releaseDeadMoney),
      apronTotal: base + apronAddon(selectedTeamAbbr, season, releaseDeadMoney),
    }
  }

  // Dead-money entries created by releasing a player on their chosen date
  // (see releaseDeadMoneyEntries) — exposed so the UI can show them alongside
  // the scraped TEAM_CAP_STATE dead money in the same "Dead Money" row.
  const getReleaseDeadMoney = useCallback((teamAbbr: string, season: Season): DeadMoney[] => {
    const teamRoster = teamAbbr === selectedTeamAbbr ? roster : getTeamRoster(teamAbbr)
    return releaseDeadMoneyEntries(teamRoster, releaseDetails, season, getEffectiveSalary)
  }, [selectedTeamAbbr, roster, releaseDetails, exercisedTeamOptions, exercisedPlayerOptions])

  // Same total as getTotalSalary, but for any team abbreviation — not just
  // the currently selected one. Used by the trade validator so a partner
  // team's cap position reflects whatever contracts/trades have already been
  // built for them in this app (via their own saved-contracts/saved-trades
  // buckets), not just their raw starting roster.
  const getTeamCapTotal = (teamAbbr: string, season: Season): { capSpaceTotal: number; apronTotal: number } => {
    const isSelected = teamAbbr === selectedTeamAbbr
    const teamRoster = isSelected ? roster : getTeamRoster(teamAbbr)
    const teamDraftPicks = isSelected
      ? draftPickPlayers
      : applyPickNumberOverrides(getDraftPickPlayers(teamAbbr), pickNumberOverrides)
    const teamSavedContracts = savedContractsByTeam[teamAbbr] || []
    const teamSavedTrades = savedTradesByTeam[teamAbbr] || []

    const teamTradedRosterIds = new Set<string>()
    const teamTradedPickIds = new Set<string>()
    teamSavedTrades.forEach((t) => {
      t.outgoingRosterPlayerIds.forEach((id) => teamTradedRosterIds.add(id))
      t.outgoingPickIds.forEach((id) => teamTradedPickIds.add(id))
    })

    const currentSalary = teamRoster
      .filter((player) => !releasedRosterIds.has(player.id) && !teamTradedRosterIds.has(player.id))
      .reduce((sum, player) => sum + getEffectiveSalary(player, season), 0)
    const savedSalary = teamSavedContracts
      .filter((contract) => !deletedContractIds.has(contract.id) && contract.contractType !== 'two-way')
      .reduce((sum, contract) => sum + (contract.salary[season] || 0), 0)
    const draftSalary = teamDraftPicks
      .filter((pick) => !teamTradedPickIds.has(pick.id))
      .reduce((sum, pick) => sum + (pick.salary[season] || 0), 0)
    const tradeIncomingSalary = teamSavedTrades.reduce((sum, trade) => {
      const players = trade.incomingPlayers.reduce((s, p) => s + (p.salary[season] || 0), 0)
      const picks = trade.incomingPicks.reduce((s, p) => s + (p.salary[season] || 0), 0)
      return sum + players + picks
    }, 0)

    const base = currentSalary + savedSalary + draftSalary + tradeIncomingSalary
    const releaseDeadMoney = releaseDeadMoneyEntries(teamRoster, releaseDetails, season, getEffectiveSalary)
      .reduce((sum, d) => sum + d.amount, 0)
    return {
      capSpaceTotal: base + capSpaceAddon(teamAbbr, season, teamRoster, teamSavedContracts, releaseDeadMoney),
      apronTotal: base + apronAddon(teamAbbr, season, releaseDeadMoney),
    }
  }

  // Get the displayed salary for a player, including any extensions (but excluding deleted ones)
  const getDisplaySalary = (player: Player, season: Season): number => {
    // First check if there's an extension for this player in this season
    const extensionForPlayer = savedContracts.find(
      (contract) => contract.type === 'extension' && contract.playerId === player.id && !deletedContractIds.has(contract.id)
    )
    
    if (extensionForPlayer && extensionForPlayer.salary[season]) {
      return extensionForPlayer.salary[season]
    }
    
    // Otherwise use the effective salary from the original contract
    return getEffectiveSalary(player, season)
  }

  const setDeletedContractIdsWithChange = (ids: Set<string>) => {
    setDeletedContractIds(ids)
    markChanged()
  }

  // Everything needed to reconstruct this team's cap table later — see the
  // one-team-at-a-time assumption in the header comment on CapSheetSnapshot.
  const buildCapSheetPayload = useCallback((): { snapshot: CapSheetSnapshot; summary: CapSheetSummary } => {
    const snapshot: CapSheetSnapshot = {
      savedContracts,
      savedTrades,
      exercisedTeamOptionKeys: Array.from(exercisedTeamOptions),
      exercisedPlayerOptionKeys: Array.from(exercisedPlayerOptions),
      deletedContractIds: Array.from(deletedContractIds),
      releasedRosterIds: Array.from(releasedRosterIds),
      releaseDetails,
      pickNumberOverrides,
      renouncedCapHoldKeys: Array.from(renouncedCapHolds),
    }

    const seasons = getDisplayedSeasons(roster, savedContracts, deletedContractIds, draftPickPlayers, savedTrades)
    const summary: CapSheetSummary = {
      seasons: seasons.map((season) => {
        const total = getTotalSalary(season).capSpaceTotal
        return { season, total, status: getCapStatus(total, CAP_THRESHOLDS[season]) }
      }),
      rosterCount: roster.filter((p) => !releasedRosterIds.has(p.id)).length,
      // Signings, trades, declined options, and releases are all moves against
      // the cap sheet, so they all count toward the total the same way.
      moveCount:
        savedContracts.length +
        savedTrades.length +
        exercisedTeamOptions.size +
        exercisedPlayerOptions.size +
        releasedRosterIds.size,
    }

    return { snapshot, summary }
  }, [savedContracts, savedTrades, exercisedTeamOptions, exercisedPlayerOptions, renouncedCapHolds, deletedContractIds, releasedRosterIds, releaseDetails, pickNumberOverrides, roster, draftPickPlayers])

  const markCapSheetSaved = useCallback((sheet: { id: string; name: string }) => {
    setHasUnsavedChanges(false)
    setActiveCapSheet(sheet)
  }, [])

  const loadCapSheet = useCallback((sheet: CapSheet) => {
    const { teamAbbr, snapshot } = sheet
    setSelectedTeamAbbrState(teamAbbr)
    setSavedContractsByTeam((prev) => ({ ...prev, [teamAbbr]: snapshot.savedContracts }))
    setSavedTradesByTeam((prev) => ({ ...prev, [teamAbbr]: snapshot.savedTrades }))
    setExercisedTeamOptions(new Set(snapshot.exercisedTeamOptionKeys))
    setExercisedPlayerOptions(new Set(snapshot.exercisedPlayerOptionKeys))
    setRenouncedCapHolds(new Set(snapshot.renouncedCapHoldKeys ?? []))
    setDeletedContractIds(new Set(snapshot.deletedContractIds))
    setReleaseDetails(releaseDetailsFromSnapshot(snapshot))
    setPickNumberOverrides({ ...snapshot.pickNumberOverrides })
    setHasUnsavedChanges(false)
    setActiveCapSheet({ id: sheet.id, name: sheet.name })
  }, [])

  // Escape hatch out of an active cap sheet — see the team switcher lock in
  // header.tsx, which disables team changes while activeCapSheet is set so a
  // saved table can't be edited into a different team by accident. Clears
  // the current team's working state back to blank (mirroring what a fresh
  // team selection would look like) and drops the active-sheet link, which
  // re-enables the team switcher for whichever team the user builds next.
  const startNewCapSheet = useCallback(() => {
    setSavedContractsByTeam((prev) => ({ ...prev, [selectedTeamAbbr]: [] }))
    setSavedTradesByTeam((prev) => ({ ...prev, [selectedTeamAbbr]: [] }))
    setExercisedTeamOptions(new Set())
    setExercisedPlayerOptions(new Set())
    setRenouncedCapHolds(new Set())
    setDeletedContractIds(new Set())
    setReleaseDetails({})
    setPickNumberOverrides({})
    setHasUnsavedChanges(false)
    setActiveCapSheet(null)
  }, [selectedTeamAbbr])

  // Call right before a Google sign-in redirect so the current working cap
  // sheet survives the hard navigation through /auth/callback — see
  // AuthRedirectDraft above. pendingSaveIntent records whether the user had
  // clicked "Save Cap Sheet" (and should land back in the naming dialog) or
  // was just signing in mid-edit (and should just land back where they were).
  const persistDraftForAuthRedirect = useCallback((pendingSaveIntent: boolean) => {
    const { snapshot } = buildCapSheetPayload()
    const draft: AuthRedirectDraft = { teamAbbr: selectedTeamAbbr, snapshot, pendingSaveIntent }
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(AUTH_REDIRECT_DRAFT_KEY, JSON.stringify(draft))
    }
  }, [buildCapSheetPayload, selectedTeamAbbr])

  const consumePendingSaveIntent = useCallback(() => setPendingSaveIntent(false), [])

  return (
    <RosterContext.Provider
      value={{
        selectedTeamAbbr,
        selectedTeam,
        roster,
        savedContracts,
        exercisedTeamOptions,
        exercisedPlayerOptions,
        renouncedCapHolds,
        hasUnsavedChanges,
        activeCapSheet,
        pendingSaveIntent,
        setSelectedTeamAbbr,
        addSavedContract,
        removeSavedContract,
        updateSavedContract,
        getPendingOfferSheets,
        matchOfferSheet,
        declineOfferSheet,
        toggleTeamOption,
        togglePlayerOption,
        getEffectiveSalary,
        isOptionExercised,
        getTotalSalary,
        getTeamCapTotal,
        getUnresolvedCapHolds,
        getReleaseDeadMoney,
        renounceCapHold,
        restoreCapHold,
        isCapHoldRenounced,
        getDisplaySalary,
        setDeletedContractIds: setDeletedContractIdsWithChange,
        deletedContractIds,
        draftPickPlayers,
        pickNumberOverrides,
        setPickNumberOverride,
        releasedRosterIds,
        releaseDetails,
        getReleaseDetail,
        releaseRosterPlayer,
        setReleaseDetail,
        restoreRosterPlayer,
        savedTrades,
        addSavedTrade,
        removeSavedTrade,
        updateSavedTrade,
        tradedRosterPlayerIds,
        tradedPickIds,
        buildCapSheetPayload,
        markCapSheetSaved,
        loadCapSheet,
        startNewCapSheet,
        persistDraftForAuthRedirect,
        consumePendingSaveIntent,
      }}
    >
      {children}
    </RosterContext.Provider>
  )
}

export function useRoster() {
  const context = useContext(RosterContext)
  if (!context) {
    throw new Error('useRoster must be used within a RosterProvider')
  }
  return context
}
