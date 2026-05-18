'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/data'
import type { Season } from '@/lib/types'
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
  const { roster, savedContracts } = useRoster()

  // Find free agents for the selected year
  const getFreeAgentsAndOptions = (year: Season) => {
    const freeAgents: typeof roster = []
    const teamOptions: typeof roster = []
    const playerOptions: typeof roster = []

    roster.forEach((player) => {
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

    return { freeAgents, teamOptions, playerOptions }
  }

  const { freeAgents, teamOptions, playerOptions } = getFreeAgentsAndOptions(selectedYear)

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

            {/* Team Options Section */}
            {teamOptions.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Team Options
                </div>
                {teamOptions.map((player) => (
                  <SelectItem key={`to-${player.id}`} value={selectedYear} disabled>
                    <div className="text-sm">
                      <span className="text-muted-foreground">{player.name}</span>
                      <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                        TO
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
                    <div className="text-sm">
                      <span className="text-muted-foreground">{player.name}</span>
                      <span className="ml-2 text-xs bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded">
                        PO
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
                <div className="font-medium">{player.name}</div>
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
