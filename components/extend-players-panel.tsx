'use client'

import { useState, useMemo } from 'react'
import { useRoster } from '@/lib/roster-context'
import { formatCurrency } from '@/lib/data'
import { SEASONS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function ExtendPlayersPanel() {
  const { roster, addSavedContract } = useRoster()
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [newSalaryData, setNewSalaryData] = useState<Record<string, number>>({})

  // Find players whose contracts end (have missing salary data in later years)
  const extendablePlayers = useMemo(() => {
    return roster.filter((player) => {
      // Find the last season where player has salary
      let lastSeason = -1
      for (let i = SEASONS.length - 1; i >= 0; i--) {
        if (player.salary[SEASONS[i]]) {
          lastSeason = i
          break
        }
      }
      // If player has salary in any season but not in all through 2029-30, they're extendable
      return lastSeason >= 0 && lastSeason < SEASONS.length - 1
    })
  }, [roster])

  const selectedPlayer = selectedPlayerId ? roster.find((p) => p.id === selectedPlayerId) : null
  const lastSeason = selectedPlayer
    ? SEASONS.findIndex((s) => !selectedPlayer.salary[s] || selectedPlayer.salary[s] === 0)
    : -1

  const handleSave = () => {
    if (!selectedPlayer) return

    // Create extension contract
    const extensionSalaries: Record<string, number> = {}
    for (let i = lastSeason; i < SEASONS.length; i++) {
      const seasonSalary = parseFloat(newSalaryData[SEASONS[i]] || '0')
      if (seasonSalary > 0) {
        extensionSalaries[SEASONS[i]] = seasonSalary
      }
    }

    if (Object.keys(extensionSalaries).length === 0) return

    addSavedContract({
      id: `ext-${selectedPlayer.id}-${Date.now()}`,
      playerName: selectedPlayer.name,
      type: 'extension',
      salary: extensionSalaries,
    })

    // Reset form
    setSelectedPlayerId(null)
    setNewSalaryData({})
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Extend Players</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {extendablePlayers.length} available
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {extendablePlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-muted-foreground">No players to extend</p>
            <p className="text-xs text-muted-foreground/70">All contracts run through 2029-30</p>
          </div>
        ) : (
          <>
            {/* Player Selection Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Select Player</label>
              <Select value={selectedPlayerId || ''} onValueChange={setSelectedPlayerId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Choose a player to extend..." />
                </SelectTrigger>
                <SelectContent>
                  {extendablePlayers.map((player) => {
                    const lastYearIndex = SEASONS.findIndex((s) => !player.salary[s] || player.salary[s] === 0) - 1
                    return (
                      <SelectItem key={player.id} value={player.id}>
                        {player.name} (ends after {SEASONS[lastYearIndex]})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Salary Input - Only show if player selected */}
            {selectedPlayer && lastSeason > 0 && (
              <div className="space-y-3 bg-muted/30 p-3 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground">
                  {selectedPlayer.name} • Starting {SEASONS[lastSeason]}
                </p>
                {SEASONS.slice(lastSeason).map((season) => (
                  <div key={season} className="flex items-center gap-2">
                    <label className="text-xs font-medium w-16">{season}</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newSalaryData[season] || ''}
                      onChange={(e) =>
                        setNewSalaryData((prev) => ({
                          ...prev,
                          [season]: e.target.value ? parseInt(e.target.value) : 0,
                        }))
                      }
                      className="h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground w-24 text-right">
                      {newSalaryData[season] ? formatCurrency(newSalaryData[season]) : '$0'}
                    </span>
                  </div>
                ))}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedPlayerId(null)
                      setNewSalaryData({})
                    }}
                    className="flex-1 text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={Object.values(newSalaryData).every((v) => !v)}
                    className="flex-1 text-xs h-7"
                  >
                    Save Extension
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
