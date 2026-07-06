'use client'

import { useState, createContext, useContext, ReactNode, useMemo, useCallback } from 'react'
import { Player, SavedContract, SavedTrade, Season, SEASONS } from './types'
import { getTeamRoster, TEAMS, CAP_THRESHOLDS } from './data'
import { getDraftPickPlayers, applyPickNumberOverrides } from './draft-picks'
import {
  TradeAsset,
  TradeSideInput,
  validateTrade,
  getOwnedFirstRoundYears,
  parsePickIdMeta,
  TRADE_EVAL_SEASON,
  CURRENT_DRAFT_YEAR,
} from './trade-validation'

interface RosterState {
  selectedTeamAbbr: string
  roster: Player[]
  savedContracts: SavedContract[]
  exercisedTeamOptions: Set<string> // player-id-season keys
  exercisedPlayerOptions: Set<string> // player-id-season keys (declined = not in set)
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
  draftPickPlayers: Player[]
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
}

const RosterContext = createContext<RosterContextType | null>(null)

export function RosterProvider({ children }: { children: ReactNode }) {
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState<string>('BOS')
  const [savedContractsByTeam, setSavedContractsByTeam] = useState<Record<string, SavedContract[]>>({})
  const [exercisedTeamOptions, setExercisedTeamOptions] = useState<Set<string>>(new Set())
  const [exercisedPlayerOptions, setExercisedPlayerOptions] = useState<Set<string>>(new Set())
  const [deletedContractIds, setDeletedContractIds] = useState<Set<string>>(new Set())
  const [releasedRosterIds, setReleasedRosterIds] = useState<Set<string>>(new Set())
  const [pickNumberOverrides, setPickNumberOverrides] = useState<Record<string, number>>({})
  const [savedTradesByTeam, setSavedTradesByTeam] = useState<Record<string, SavedTrade[]>>({})

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
        assets.push({ kind: 'player', id: player.id, name: player.name, salaryBySeason })
        return
      }
      const contract = savedContracts.find((c) => c.id === id && !deletedContractIds.has(c.id))
      if (contract) {
        assets.push({
          kind: 'player',
          id: contract.id,
          name: contract.playerName,
          salaryBySeason: contract.salary,
          isMinimum: contract.isMinimum,
        })
      }
    })
    trade.outgoingPickIds.forEach((id) => {
      const pick = draftPickPlayers.find((p) => p.id === id)
      if (pick) {
        const { pickYear, pickRound } = parsePickIdMeta(id)
        assets.push({ kind: 'pick', id: pick.id, name: pick.name, salaryBySeason: pick.salary, pickYear, pickRound })
      }
    })
    return assets
  }

  function resolveIncomingAssets(trade: SavedTrade): TradeAsset[] {
    const players: TradeAsset[] = trade.incomingPlayers.map((p) => ({
      kind: 'player',
      id: p.playerId,
      name: p.playerName,
      salaryBySeason: p.salary,
    }))
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
  }, [selectedTeamAbbr, roster, draftPickPlayers, savedContracts, deletedContractIds])

  const removeSavedTrade = useCallback((id: string) => {
    setSavedTradesByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).filter((t) => t.id !== id),
    }))
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
  }, [selectedTeamAbbr, roster, draftPickPlayers, savedContracts, deletedContractIds])

  const addSavedContract = (contract: SavedContract) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: [...(prev[selectedTeamAbbr] || []), contract],
    }))
  }

  const releaseRosterPlayer = (playerId: string) => {
    setReleasedRosterIds((prev) => new Set(prev).add(playerId))
  }

  const restoreRosterPlayer = (playerId: string) => {
    setReleasedRosterIds((prev) => {
      const next = new Set(prev)
      next.delete(playerId)
      return next
    })
  }

  const removeSavedContract = (id: string) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).filter((c) => c.id !== id),
    }))
  }

  const updateSavedContract = (contract: SavedContract) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).map((c) => c.id === contract.id ? contract : c),
    }))
  }

  // exercise = true means keep the salary, false means decline (salary becomes 0)
  const toggleTeamOption = (playerId: string, season: Season, exercise: boolean) => {
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

    return {
      current: currentSalary,
      saved: savedSalary,
      total: currentSalary + savedSalary + draftSalary + tradeIncomingPlayerSalary + tradeIncomingPickSalary,
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

    return currentSalary + savedSalary + draftSalary + tradeIncomingSalary
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

  return (
    <RosterContext.Provider
      value={{
        selectedTeamAbbr,
        selectedTeam,
        roster,
        savedContracts,
        exercisedTeamOptions,
        exercisedPlayerOptions,
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
        setDeletedContractIds,
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
