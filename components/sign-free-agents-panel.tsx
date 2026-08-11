'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import type { Season, Player, SavedContract } from '@/lib/types'
import { getTeamRoster, ALL_TEAMS, formatCurrency } from '@/lib/data'
import { FREE_AGENT_POOL } from '@/lib/free-agents'
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

// Players whose first contract-free year in the DB matches `year` — the same
// filter both the panel's own list and any header/tab count badge use, kept
// in one place so they can't drift out of sync.
export function getAvailableFreeAgents(year: Season, savedContracts: SavedContract[]): Player[] {
  const freeAgents: Player[] = []
  const seenNames = new Set<string>()

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
      seenNames.add(player.name)
    })
  })

  // RealGM's current-free-agents pool (lib/free-agents.ts) covers players
  // with no roster row in player-data.ts at all — they're unsigned right
  // now, so they never show up in the loop above. Only valid for the
  // current free-agency period: it's a snapshot of who's unsigned today,
  // not a projection of future years' free agents.
  if (year === SEASONS[0]) {
    FREE_AGENT_POOL.forEach((fa, idx) => {
      if (seenNames.has(fa.name)) return

      const id = `fa-${idx}`
      const hasExtensionThisYear = savedContracts.some(
        (c) => c.type === 'extension' && c.playerId === id && c.salary[year] && c.salary[year]! > 0
      )
      if (hasExtensionThisYear) return

      freeAgents.push({ id, name: fa.name, team: fa.priorTeam, salary: {}, options: {} })
      seenNames.add(fa.name)
    })
  }

  return freeAgents.sort((a, b) => (b.salary['2026-27'] || 0) - (a.salary['2026-27'] || 0))
}

export function SignFreeAgentsPanelContent({
  selectedYear,
  onSelectedYearChange,
}: {
  selectedYear: Season
  onSelectedYearChange: (year: Season) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { savedContracts } = useRoster()

  const freeAgents = getAvailableFreeAgents(selectedYear, savedContracts)

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedPlayer(null)
  }

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
      <div className="flex gap-2">
        <Select value={selectedYear} onValueChange={(value) => onSelectedYearChange(value as Season)}>
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

      <SignFreeAgentModal
        player={selectedPlayer}
        startingSeason={selectedYear}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  )
}

export function SignFreeAgentsPanel() {
  const [selectedYear, setSelectedYear] = useState<Season>(SEASONS[0])
  const [isCollapsed, setIsCollapsed] = useState(true)
  const { savedContracts, selectedTeam } = useRoster()

  const freeAgentCount = getAvailableFreeAgents(selectedYear, savedContracts).length

  return (
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
                {freeAgentCount}
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
              <SignFreeAgentsPanelContent selectedYear={selectedYear} onSelectedYearChange={setSelectedYear} />
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  )
}
