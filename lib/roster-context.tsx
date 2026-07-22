'use client'

import { useState, createContext, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react'
import { Player, SavedContract, SavedTrade, Season, SEASONS, CapSheet, CapSheetSnapshot, CapSheetSummary } from './types'
import { getTeamRoster, TEAMS, CAP_THRESHOLDS, getCapStatus } from './data'
import { getDraftPickPlayers, applyPickNumberOverrides, DraftPickPlayer } from './draft-picks'
import { getPlayerRookieYear, getPlayerYOE, getDisplayedSeasons } from './contract-utils'
import { getContractDetail } from './contract-details'
import { getTeamCapState } from './team-cap-state'
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

// schema doc §2a — converts a player's per-season guarantee status into the
// discounted "counts toward the match" amount. Returns undefined (no discount,
// full salary counts) whenever the player has no guarantee data at all, which
// is every player today since no data source populates Player.guarantees yet.
function guaranteedBySeasonFor(player: Player, getSalary: (p: Player, s: Season) => number): Partial<Record<Season, number>> | undefined {
  if (!player.guarantees) return undefined
  const result: Partial<Record<Season, number>> = {}
  SEASONS.forEach((s) => {
    const g = player.guarantees?.[s]
    if (!g || g.status === 'full') return // absent or full — no entry needed, full salary counts
    result[s] = g.status === 'non-guaranteed' ? 0 : (g.amount ?? 0)
  })
  return Object.keys(result).length > 0 ? result : undefined
}

// schema doc §3a — dead money, cap holds, and the apron addon are facts
// imported from team-cap-state.ts, not derived from the roster/contracts
// already summed above. Always 0 today since TEAM_CAP_STATE is empty, so
// preTradeTotal is unchanged until real team-state data is entered.
function teamCapStateAddon(teamAbbr: string, season: Season): number {
  const state = getTeamCapState(teamAbbr, season)
  if (!state) return 0
  const deadMoney = state.deadMoney.reduce((sum, d) => sum + d.amount, 0)
  const capHolds = state.capHolds.reduce((sum, h) => sum + h.amount, 0)
  return deadMoney + capHolds + (state.apronAddon ?? 0)
}

interface RosterState {
  selectedTeamAbbr: string
  roster: Player[]
  savedContracts: SavedContract[]
  exercisedTeamOptions: Set<string> // player-id-season keys
  exercisedPlayerOptions: Set<string> // player-id-season keys (declined = not in set)
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
// — survives the round trip. Consumed by the lazy useState initializers below
// and cleared by the mount effect right after.
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
  toggleTeamOption: (playerId: string, season: Season, exercise: boolean) => void
  togglePlayerOption: (playerId: string, season: Season, exercise: boolean) => void
  getEffectiveSalary: (player: Player, season: Season) => number
  isOptionExercised: (playerId: string, season: Season, optionType: 'Team' | 'Player') => boolean | null
  getTotalSalary: (season: Season) => { current: number; saved: number; total: number }
  getTeamCapTotal: (teamAbbr: string, season: Season) => number
  getDisplaySalary: (player: Player, season: Season) => number
  setDeletedContractIds: (ids: Set<string>) => void
  deletedContractIds: Set<string>
  draftPickPlayers: DraftPickPlayer[]
  pickNumberOverrides: Record<string, number>
  setPickNumberOverride: (pickId: string, pickNumber: number | null) => void
  releasedRosterIds: Set<string>
  releaseRosterPlayer: (playerId: string) => void
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
  const [deletedContractIds, setDeletedContractIds] = useState<Set<string>>(new Set())
  const [releasedRosterIds, setReleasedRosterIds] = useState<Set<string>>(new Set())
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
    setDeletedContractIds(new Set(snapshot.deletedContractIds))
    setReleasedRosterIds(new Set(snapshot.releasedRosterIds))
    setPickNumberOverrides({ ...snapshot.pickNumberOverrides })
    setHasUnsavedChanges(true)
    setPendingSaveIntent(draft.pendingSaveIntent)
    clearAuthRedirectDraft()
  }, [])

  const markChanged = useCallback(() => setHasUnsavedChanges(true), [])

  // A fresh team selection starts with its "Save Cap Sheet" button greyed out
  // and no longer tied to whatever saved sheet you were last editing — see
  // the Save Cap Sheet button's disabled/label state in roster-table.tsx.
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

    const yourPreTradeTotal = getTotalSalary(season).total
    const theirPreTradeTotal = getTeamCapTotal(trade.tradeTeamAbbr, season)

    const yourSide: TradeSideInput = {
      side: 'yours',
      teamAbbr: selectedTeamAbbr,
      teamName: TEAMS[selectedTeamAbbr]?.name ?? selectedTeamAbbr,
      preTradeTotal: yourPreTradeTotal,
      approximate: false,
      outgoing: yourOutgoing,
      incoming: yourIncoming,
    }
    const theirSide: TradeSideInput = {
      side: 'theirs',
      teamAbbr: trade.tradeTeamAbbr,
      teamName: TEAMS[trade.tradeTeamAbbr]?.name ?? trade.tradeTeamAbbr,
      preTradeTotal: theirPreTradeTotal,
      approximate: true,
      outgoing: yourIncoming,
      incoming: yourOutgoing,
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

  const releaseRosterPlayer = (playerId: string) => {
    setReleasedRosterIds((prev) => new Set(prev).add(playerId))
    markChanged()
  }

  const restoreRosterPlayer = (playerId: string) => {
    setReleasedRosterIds((prev) => {
      const next = new Set(prev)
      next.delete(playerId)
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

  const getEffectiveSalary = (player: Player, season: Season): number => {
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
      .filter((contract) => !deletedContractIds.has(contract.id))
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

    const capStateAddon = teamCapStateAddon(selectedTeamAbbr, season)

    return {
      current: currentSalary,
      saved: savedSalary,
      total: currentSalary + savedSalary + draftSalary + tradeIncomingPlayerSalary + tradeIncomingPickSalary + capStateAddon,
    }
  }

  // Same total as getTotalSalary, but for any team abbreviation — not just
  // the currently selected one. Used by the trade validator so a partner
  // team's cap position reflects whatever contracts/trades have already been
  // built for them in this app (via their own saved-contracts/saved-trades
  // buckets), not just their raw starting roster.
  const getTeamCapTotal = (teamAbbr: string, season: Season): number => {
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
      .filter((contract) => !deletedContractIds.has(contract.id))
      .reduce((sum, contract) => sum + (contract.salary[season] || 0), 0)
    const draftSalary = teamDraftPicks
      .filter((pick) => !teamTradedPickIds.has(pick.id))
      .reduce((sum, pick) => sum + (pick.salary[season] || 0), 0)
    const tradeIncomingSalary = teamSavedTrades.reduce((sum, trade) => {
      const players = trade.incomingPlayers.reduce((s, p) => s + (p.salary[season] || 0), 0)
      const picks = trade.incomingPicks.reduce((s, p) => s + (p.salary[season] || 0), 0)
      return sum + players + picks
    }, 0)

    return currentSalary + savedSalary + draftSalary + tradeIncomingSalary + teamCapStateAddon(teamAbbr, season)
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
      pickNumberOverrides,
    }

    const seasons = getDisplayedSeasons(roster, savedContracts, deletedContractIds, draftPickPlayers, savedTrades)
    const summary: CapSheetSummary = {
      seasons: seasons.map((season) => {
        const total = getTotalSalary(season).total
        return { season, total, status: getCapStatus(total, CAP_THRESHOLDS[season]) }
      }),
      rosterCount: roster.filter((p) => !releasedRosterIds.has(p.id)).length,
      moveCount: savedContracts.length + savedTrades.length,
    }

    return { snapshot, summary }
  }, [savedContracts, savedTrades, exercisedTeamOptions, exercisedPlayerOptions, deletedContractIds, releasedRosterIds, pickNumberOverrides, roster, draftPickPlayers])

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
    setDeletedContractIds(new Set(snapshot.deletedContractIds))
    setReleasedRosterIds(new Set(snapshot.releasedRosterIds))
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
    setDeletedContractIds(new Set())
    setReleasedRosterIds(new Set())
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
        hasUnsavedChanges,
        activeCapSheet,
        pendingSaveIntent,
        setSelectedTeamAbbr,
        addSavedContract,
        removeSavedContract,
        updateSavedContract,
        toggleTeamOption,
        togglePlayerOption,
        getEffectiveSalary,
        isOptionExercised,
        getTotalSalary,
        getTeamCapTotal,
        getDisplaySalary,
        setDeletedContractIds: setDeletedContractIdsWithChange,
        deletedContractIds,
        draftPickPlayers,
        pickNumberOverrides,
        setPickNumberOverride,
        releasedRosterIds,
        releaseRosterPlayer,
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
