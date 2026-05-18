'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import type { Season } from '@/lib/types'
import { getTeamRoster, ALL_TEAMS, formatCurrency } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

export function SignFreeAgentsPanel() {
  const [selectedYear, setSelectedYear] = useState<Season>(SEASONS[1])
  const { savedContracts } = useRoster()

  // Get all players from all teams and find free agents for the selected year
  const getAllFreeAgentsAndOptions = (year: Season) => {
    const freeAgents: any[] = []
    const teamOptions: any[] = []
    const playerOptions: any[] = []

    // Get all players from all teams
    ALL_TEAMS.forEach((teamAbbr) => {
      const teamRoster = getTeamRoster(teamAbbr)

      teamRoster.forEach((player) => {
        const hasContractThisYear = player.salary[year] && player.salary[year] > 0
        const hasExtensionThisYear = savedContracts.some(
          (c) =>
            c.type === 'extension' &&
            c.playerId === player.id &&
            c.salary[year] &&
            c.salary[year] > 0
        )
        const hasEffectiveContract = hasContractThisYear || hasExtensionThisYear

        if (!hasEffectiveContract) {
          // Check if they have an option this year
          const optionType = player.options[year]
          if (optionType === 'Team') {
            teamOptions.push(player)
          } else if (optionType === 'Player') {
            playerOptions.push(player)
          } else {
            // No option, they're a free agent
            freeAgents.push(player)
          }
        }
      })
    })

    // Sort all groups by 25-26 salary descending
    const sortBySalary = (players: any[]) =>
      players.sort((a, b) => (b.salary['2025-26'] || 0) - (a.salary['2025-26'] || 0))

    return {
      freeAgents: sortBySalary(freeAgents),
      teamOptions: sortBySalary(teamOptions),
      playerOptions: sortBySalary(playerOptions),
    }
  }

  const { freeAgents, teamOptions, playerOptions } = getAllFreeAgentsAndOptions(selectedYear)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sign Free Agents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedYear} onValueChange={(value) => setSelectedYear(value as Season)}>
          <SelectTrigger>
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {SEASONS.slice(1).map((season) => (
              <SelectItem key={season} value={season}>
                {season}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Free Agents List */}
        <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2">
          {freeAgents.length > 0 ? (
            freeAgents.map((player) => (
              <div
                key={player.id}
                className="p-2 rounded-lg bg-muted/50 border border-muted/20 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{player.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(player.salary['2025-26'] || 0)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{player.team}</div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No free agents available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
