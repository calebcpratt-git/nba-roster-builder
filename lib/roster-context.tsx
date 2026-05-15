'use client'

import { useState, createContext, useContext, ReactNode, useMemo } from 'react'
import { Player, SavedContract, Season, SEASONS } from './types'
import { getTeamRoster, TEAMS } from './data'

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
}

const RosterContext = createContext<RosterContextType | null>(null)

export function RosterProvider({ children }: { children: ReactNode }) {
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState<string>('BOS')
  const [savedContracts, setSavedContracts] = useState<SavedContract[]>([])
  const [exercisedTeamOptions, setExercisedTeamOptions] = useState<Set<string>>(new Set())
  const [exercisedPlayerOptions, setExercisedPlayerOptions] = useState<Set<string>>(new Set())

  const roster = useMemo(() => getTeamRoster(selectedTeamAbbr), [selectedTeamAbbr])
  const selectedTeam = TEAMS[selectedTeamAbbr] || { name: 'Unknown', city: 'Unknown', primaryColor: '#000', secondaryColor: '#fff' }

  const addSavedContract = (contract: SavedContract) => {
    setSavedContracts((prev) => [...prev, contract])
  }

  const removeSavedContract = (id: string) => {
    setSavedContracts((prev) => prev.filter((c) => c.id !== id))
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
    const savedSalary = savedContracts.reduce((sum, contract) => sum + (contract.salary[season] || 0), 0)
    
    return {
      current: currentSalary,
      saved: savedSalary,
      total: currentSalary + savedSalary,
    }
  }

  // Get the displayed salary for a player, including any extensions
  const getDisplaySalary = (player: Player, season: Season): number => {
    // First check if there's an extension for this player in this season
    const extensionForPlayer = savedContracts.find(
      (contract) => contract.type === 'extension' && contract.playerId === player.id
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
