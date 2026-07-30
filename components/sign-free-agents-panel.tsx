'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import type { Season, Player } from '@/lib/types'
import { getTeamRoster, ALL_TEAMS, formatCurrency } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { SignFreeAgentModal } from './sign-free-agent-modal'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SignFreeAgentsPanel() {
  const [selectedYear, setSelectedYear] = useState<Season>(SEASONS[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const { savedContracts, selectedTeamAbbr, selectedTeam } = useRoster()

  // Get all players whose first contract-free year in the DB matches the selected year
  const getAllFreeAgentsAndOptions = (year: Season) => {
    const freeAgents: Player[] = []

    ALL_TEAMS.forEach((teamAbbr) => {
      const teamRoster = getTeamRoster(teamAbbr)

      teamRoster.forEach((player) => {
        // Find the first season where the player has no salary in the database
        const firstFreeSeason = SEASONS.find((s) => !(player.salary[s] && player.salary[s]! > 0))

        // Only show the player in the year that is their first year without a contract
        if (!firstFreeSeason || firstFreeSeason !== year) return

        // Skip if an extension already covers this year
        const hasExtensionThisYear = savedContracts.some(
          (c) =>
            c.type === 'extension' &&
            c.playerId === player.id &&
            c.salary[year] &&
            c.salary[year]! > 0
        )
        if (hasExtensionThisYear) return

        freeAgents.push(player)
      })
    })

    const sortBySalary = (players: Player[]) =>
      players.sort((a, b) => (b.salary['2026-27'] || 0) - (a.salary['2026-27'] || 0))

    return {
      freeAgents: sortBySalary(freeAgents),
      teamOptions: [],
      playerOptions: [],
    }
  }

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedPlayer(null)
  }

  const { freeAgents, teamOptions, playerOptions } = getAllFreeAgentsAndOptions(selectedYear)

  // Check if a player has already been signed as a free agent on this team
  const isPlayerAlreadySigned = (player: Player) => {
    return savedContracts.some(
      (contract) =>
        contract.playerId === player.id && 
        contract.playerName === player.name &&
        contract.type === 'free-agent'
    )
  }

  // Filter free agents by search query - match if any word in the name starts with the query
  const filteredFreeAgents = freeAgents.filter((player) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase().trim()
    const nameWords = player.name.toLowerCase().split(' ')
    return nameWords.some((word) => word.startsWith(query))
  })

  return (
    <>
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="cursor-pointer rounded-lg overflow-hidden border border-border"
        style={!isCollapsed ? { borderColor: selectedTeam.primaryColor } : undefined}
      >
        <Card className="border-0 rounded-none shadow-none py-0 gap-0">
          <CardHeader
            className={cn(
              "select-none py-2.5 px-3.5 gap-0 transition-colors [.border-b]:pb-2.5",
              isCollapsed ? "bg-accent hover:bg-accent/70" : ""
            )}
            style={!isCollapsed ? { background: selectedTeam.primaryColor } : undefined}
          >
            <div className="flex items-center justify-between">
              <CardTitle className={cn("text-[12.5px] font-semibold flex items-center gap-1.5", !isCollapsed && "text-white")}>
                Free Agents
                <span className={cn("font-medium", isCollapsed ? "text-muted-foreground" : "text-white/75")}>
                  {freeAgents.length}
                </span>
              </CardTitle>
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  isCollapsed ? "rotate-0 text-muted-foreground" : "rotate-90 text-white/80"
                )}
              />
            </div>
          </CardHeader>
          <div
            className={`grid transition-all duration-300 ease-in-out ${
              isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
          <div className="overflow-hidden">
            <CardContent className="space-y-4 pt-4">
          <div className="flex gap-2">
            <Select value={selectedYear} onValueChange={(value) => setSelectedYear(value as Season)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {SEASONS.slice(0, 5).map((season) => (
                  <SelectItem key={season} value={season}>
                    {season}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
          </div>

          {/* Free Agents List */}
          <div className="space-y-2">
            {/* Column Header */}
            <div className="px-2 flex items-center justify-between text-xs text-muted-foreground font-medium">
              <div>Player</div>
              {selectedYear !== '2026-27' && <div>Current Avg Salary</div>}
            </div>
            
            {/* Scrollable List */}
            <div className="space-y-2 h-[312px] max-h-[312px] overflow-y-auto pr-2">
              {filteredFreeAgents.length > 0 ? (
                filteredFreeAgents.map((player, index) => {
                  const isAlreadySigned = isPlayerAlreadySigned(player)
                  return (
                    <div
                      key={`${player.team}-${player.id}-${index}`}
                      onClick={() => !isAlreadySigned && handlePlayerClick(player)}
                      className={`p-2 rounded-lg border text-sm transition-colors ${
                        isAlreadySigned
                          ? 'bg-muted/20 border-muted/10 text-muted-foreground cursor-not-allowed opacity-50'
                          : 'bg-muted/50 border-muted/20 cursor-pointer hover:bg-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{player.name}</div>
                        {selectedYear !== '2026-27' && (
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(player.salary['2026-27'] || 0)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No free agents available
                </div>
              )}
            </div>
          </div>
        </CardContent>
          </div>
        </div>
        </Card>
      </div>

      <SignFreeAgentModal
        player={selectedPlayer}
        startingSeason={selectedYear}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  )
}
