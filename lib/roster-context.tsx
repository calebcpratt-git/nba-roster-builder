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

  const toggleTeamOption = (playerId: string, season: Season, exercise: boolean) => {
    const key = `${playerId}-${season}`
    setExercisedTeamOptions((prev) => {
      const next = new Set(prev)
      if (exercise) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  const togglePlayerOption = (playerId: string, season: Season, exercise: boolean) => {
    const key = `${playerId}-${season}`
    setExercisedPlayerOptions((prev) => {
      const next = new Set(prev)
      if (exercise) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  // Returns true if exercised, false if declined, null if no decision yet
  const isOptionExercised = (playerId: string, season: Season, optionType: 'Team' | 'Player'): boolean | null => {
    const key = `${playerId}-${season}`
    if (optionType === 'Team') {
      if (exercisedTeamOptions.has(key)) return true
      // Check if explicitly declined (we track exercises, so absence means pending or declined)
      return null
    } else {
      if (exercisedPlayerOptions.has(key)) return true
      return null
    }
  }

  const getEffectiveSalary = (player: Player, season: Season): number => {
    const salary = player.salary[season]
    if (!salary) return 0

    const optionType = player.options[season]
    if (!optionType) return salary

    const key = `${player.id}-${season}`
    
    // Team option: default is NOT exercised (player becomes free agent)
    if (optionType === 'Team') {
      return exercisedTeamOptions.has(key) ? salary : 0
    }
    
    // Player option: default is exercised (player keeps the money)
    if (optionType === 'Player') {
      // If explicitly marked as declined, return 0
      // Otherwise assume exercised (player keeps the salary)
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
