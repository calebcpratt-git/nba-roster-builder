'use client'

import { useState, createContext, useContext, ReactNode } from 'react'
import { Player, SavedContract, Team, Season, SEASONS } from './types'
import { SAMPLE_ROSTER, TEAMS } from './data'

interface RosterState {
  selectedTeam: Team
  roster: Player[]
  savedContracts: SavedContract[]
  selectedSeason: Season
  exercisedTeamOptions: Set<string>
  declinedPlayerOptions: Set<string>
}

interface RosterContextType extends RosterState {
  setSelectedTeam: (team: Team) => void
  setSelectedSeason: (season: Season) => void
  addSavedContract: (contract: SavedContract) => void
  removeSavedContract: (id: string) => void
  exerciseTeamOption: (playerId: string) => void
  declineTeamOption: (playerId: string) => void
  exercisePlayerOption: (playerId: string) => void
  declinePlayerOption: (playerId: string) => void
  getEffectiveSalary: (player: Player, season: Season) => number
  getTotalSalary: (season: Season) => { current: number; saved: number; total: number }
}

const RosterContext = createContext<RosterContextType | null>(null)

export function RosterProvider({ children }: { children: ReactNode }) {
  const [selectedTeam, setSelectedTeam] = useState<Team>(TEAMS[0])
  const [roster, setRoster] = useState<Player[]>(SAMPLE_ROSTER)
  const [savedContracts, setSavedContracts] = useState<SavedContract[]>([])
  const [selectedSeason, setSelectedSeason] = useState<Season>('2024-25')
  const [exercisedTeamOptions, setExercisedTeamOptions] = useState<Set<string>>(new Set())
  const [declinedPlayerOptions, setDeclinedPlayerOptions] = useState<Set<string>>(new Set())

  const addSavedContract = (contract: SavedContract) => {
    setSavedContracts((prev) => [...prev, contract])
  }

  const removeSavedContract = (id: string) => {
    setSavedContracts((prev) => prev.filter((c) => c.id !== id))
  }

  const exerciseTeamOption = (playerId: string) => {
    setExercisedTeamOptions((prev) => new Set(prev).add(playerId))
  }

  const declineTeamOption = (playerId: string) => {
    setExercisedTeamOptions((prev) => {
      const next = new Set(prev)
      next.delete(playerId)
      return next
    })
  }

  const exercisePlayerOption = (playerId: string) => {
    setDeclinedPlayerOptions((prev) => {
      const next = new Set(prev)
      next.delete(playerId)
      return next
    })
  }

  const declinePlayerOption = (playerId: string) => {
    setDeclinedPlayerOptions((prev) => new Set(prev).add(playerId))
  }

  const getEffectiveSalary = (player: Player, season: Season): number => {
    const salary = player.salary[season]
    if (!salary) return 0

    // Check team option
    if (player.teamOption === season && !exercisedTeamOptions.has(player.id)) {
      return 0
    }

    // Check player option
    if (player.playerOption === season && declinedPlayerOptions.has(player.id)) {
      return 0
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
        selectedTeam,
        roster,
        savedContracts,
        selectedSeason,
        exercisedTeamOptions,
        declinedPlayerOptions,
        setSelectedTeam,
        setSelectedSeason,
        addSavedContract,
        removeSavedContract,
        exerciseTeamOption,
        declineTeamOption,
        exercisePlayerOption,
        declinePlayerOption,
        getEffectiveSalary,
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
