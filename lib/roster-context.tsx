'use client'

import { useState, createContext, useContext, ReactNode, useMemo } from 'react'
import { Player, SavedContract, Season, SEASONS } from './types'
import { getTeamRoster, TEAMS } from './data'
import { getDraftPickPlayers } from './draft-picks'
import { getScaledRookieSalary } from './rookie-salaries'

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
  toggleTeamOption: (playerId: string, season: Season, exercise: boolean) => void
  togglePlayerOption: (playerId: string, season: Season, exercise: boolean) => void
  getEffectiveSalary: (player: Player, season: Season) => number
  isOptionExercised: (playerId: string, season: Season, optionType: 'Team' | 'Player') => boolean | null
  getTotalSalary: (season: Season) => { current: number; saved: number; total: number }
  getDisplaySalary: (player: Player, season: Season) => number
  setDeletedContractIds: (ids: Set<string>) => void
  deletedContractIds: Set<string>
  draftPickPlayers: Player[]
  pickNumberOverrides: Record<string, number>
  setPickNumberOverride: (pickId: string, pickNumber: number | null) => void
}

const RosterContext = createContext<RosterContextType | null>(null)

export function RosterProvider({ children }: { children: ReactNode }) {
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState<string>('BOS')
  const [savedContractsByTeam, setSavedContractsByTeam] = useState<Record<string, SavedContract[]>>({})
  const [exercisedTeamOptions, setExercisedTeamOptions] = useState<Set<string>>(new Set())
  const [exercisedPlayerOptions, setExercisedPlayerOptions] = useState<Set<string>>(new Set())
  const [deletedContractIds, setDeletedContractIds] = useState<Set<string>>(new Set())
  const [pickNumberOverrides, setPickNumberOverrides] = useState<Record<string, number>>({})

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

  const draftPickPlayers = useMemo(() => {
    const raw = getDraftPickPlayers(selectedTeamAbbr)
    return raw.map((pick) => {
      const yearMatch = pick.id.match(/^draft-(\d+)-/)
      const draftYear = yearMatch ? parseInt(yearMatch[1]) : 0
      const isFutureFirstRound = pick.id.includes('First-Round') && draftYear >= 2027

      // For future first-round picks always compute through this path so the default
      // (#16) and any explicit selection use identical code — no two-path divergence.
      const pickNumber = isFutureFirstRound
        ? (pickNumberOverrides[pick.id] ?? 16)
        : pickNumberOverrides[pick.id]

      if (pickNumber === undefined) return pick

      const scaled = getScaledRookieSalary(pickNumber, draftYear)
      if (!scaled) return pick

      const startSeason = `${draftYear}-${String(draftYear + 1).slice(2)}` as Season
      const startIdx = SEASONS.indexOf(startSeason)
      if (startIdx === -1) return pick

      const salary: Partial<Record<Season, number>> = {}
      const options: Partial<Record<Season, 'Player' | 'Team'>> = {}
      const [y1, y2, y3, y4] = [SEASONS[startIdx], SEASONS[startIdx + 1], SEASONS[startIdx + 2], SEASONS[startIdx + 3]]
      if (y1) salary[y1] = scaled.year1
      if (y2) salary[y2] = scaled.year2
      if (y3) { salary[y3] = scaled.year3; options[y3] = 'Team' }
      if (y4) { salary[y4] = scaled.year4; options[y4] = 'Team' }

      const name = isFutureFirstRound ? `${draftYear} - 1st` : `${draftYear} - 1st (#${pickNumber})`
      return { ...pick, name, salary, options }
    })
  }, [selectedTeamAbbr, pickNumberOverrides])
  const selectedTeam = TEAMS[selectedTeamAbbr] || { name: 'Unknown', city: 'Unknown', primaryColor: '#000', secondaryColor: '#fff' }
  
  // Get saved contracts for the current team
  const savedContracts = savedContractsByTeam[selectedTeamAbbr] || []

  const addSavedContract = (contract: SavedContract) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: [...(prev[selectedTeamAbbr] || []), contract],
    }))
  }

  const removeSavedContract = (id: string) => {
    setSavedContractsByTeam((prev) => ({
      ...prev,
      [selectedTeamAbbr]: (prev[selectedTeamAbbr] || []).filter((c) => c.id !== id),
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
    const currentSalary = roster.reduce((sum, player) => sum + getEffectiveSalary(player, season), 0)
    const savedSalary = savedContracts
      .filter((contract) => !deletedContractIds.has(contract.id))
      .reduce((sum, contract) => sum + (contract.salary[season] || 0), 0)
    const draftSalary = draftPickPlayers.reduce((sum, pick) => sum + (pick.salary[season] || 0), 0)

    return {
      current: currentSalary,
      saved: savedSalary,
      total: currentSalary + savedSalary + draftSalary,
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
        toggleTeamOption,
        togglePlayerOption,
        getEffectiveSalary,
        isOptionExercised,
        getTotalSalary,
        getDisplaySalary,
        setDeletedContractIds,
        deletedContractIds,
        draftPickPlayers,
        pickNumberOverrides,
        setPickNumberOverride,
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
