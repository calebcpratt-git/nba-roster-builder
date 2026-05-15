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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

export function ExtendPlayersPanel() {
  const { roster, addSavedContract } = useRoster()
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [newSalaryData, setNewSalaryData] = useState<Record<string, number>>({})
  const [isOpen, setIsOpen] = useState(false)

  // Find players whose contracts end (have missing salary data in later years)
  const extendableePlayers = useMemo(() => {
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
    setIsOpen(false)
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Extend Players</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {extendableePlayers.length} available
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {extendableePlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-muted-foreground">No players to extend</p>
            <p className="text-xs text-muted-foreground/70">All contracts run through 2029-30</p>
          </div>
        ) : (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full mb-3">
                <Plus className="h-4 w-4 mr-2" />
                Create Extension
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Extend Player Contract</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Player Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Player</label>
                  <Select value={selectedPlayerId || ''} onValueChange={setSelectedPlayerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a player to extend..." />
                    </SelectTrigger>
                    <SelectContent>
                      {extendableePlayers.map((player) => {
                        const lastYearWithSalary = SEASONS.findIndex((s) => !player.salary[s] || player.salary[s] === 0) - 1
                        return (
                          <SelectItem key={player.id} value={player.id}>
                            {player.name} (ends after {SEASONS[lastYearWithSalary]})
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Salary Input */}
                {selectedPlayer && lastSeason > 0 && (
                  <div className="space-y-3 bg-muted/30 p-3 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground">
                      Extension starts in {SEASONS[lastSeason]} • {selectedPlayer.name}
                    </p>
                    {SEASONS.slice(lastSeason).map((season) => (
                      <div key={season} className="flex items-center gap-2">
                        <label className="text-xs font-medium w-20">{season}</label>
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
                          className="h-8 text-xs"
                        />
                        <span className="text-xs text-muted-foreground w-24 text-right">
                          {newSalaryData[season]
                            ? formatCurrency(newSalaryData[season])
                            : '$0'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!selectedPlayer || Object.values(newSalaryData).every((v) => !v)}
                    className="flex-1"
                  >
                    Save Extension
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* List of available players */}
        {extendableePlayers.length > 0 && (
          <div className="space-y-1.5">
            {extendableePlayers.map((player) => {
              const lastYearIndex = SEASONS.findIndex((s) => !player.salary[s] || player.salary[s] === 0) - 1
              const lastYear = SEASONS[lastYearIndex]
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedPlayerId(player.id)
                    setIsOpen(true)
                  }}
                >
                  <div>
                    <p className="text-xs font-medium">{player.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {lastYear && `Current contract ends ${lastYear}`}
                    </p>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
