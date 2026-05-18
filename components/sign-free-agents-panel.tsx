'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import type { Season } from '@/lib/types'
import { getTeamRoster, TEAM_NAMES, formatCurrency } from '@/lib/data'
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
  const [selectedYear, setSelectedYear] = useState<Season>(SEASONS[0])
  const { savedContracts } = useRoster()

  // Get all players from all teams and find free agents for the selected year
  const getAllFreeAgentsAndOptions = (year: Season) => {
    const freeAgents: any[] = []
    const teamOptions: any[] = []
    const playerOptions: any[] = []

    // Get all players from all teams
    TEAM_NAMES.forEach((teamAbbr) => {
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
            {SEASONS.map((season) => (
              <SelectItem key={season} value={season}>
                {season}
              </SelectItem>
            ))}

            {/* Free Agents Section */}
            {freeAgents.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Free Agents
                </div>
                {freeAgents.map((player) => (
                  <SelectItem key={`fa-${player.id}`} value={selectedYear} disabled>
                    <div className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">{player.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(player.salary['2025-26'] || 0)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </>
            )}

            {/* Team Options Section */}
            {teamOptions.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Team Options
                </div>
                {teamOptions.map((player) => (
                  <SelectItem key={`to-${player.id}`} value={selectedYear} disabled>
                    <div className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">{player.name}</span>
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                        TO
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(player.salary['2025-26'] || 0)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </>
            )}

            {/* Player Options Section */}
            {playerOptions.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Player Options
                </div>
                {playerOptions.map((player) => (
                  <SelectItem key={`po-${player.id}`} value={selectedYear} disabled>
                    <div className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">{player.name}</span>
                      <span className="text-xs bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded">
                        PO
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(player.salary['2025-26'] || 0)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>

        {/* Free Agents List */}
        <div className="space-y-2">
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
