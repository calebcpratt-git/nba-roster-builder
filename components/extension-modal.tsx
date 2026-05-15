'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Player, Season, SEASONS } from '@/lib/types'
import { formatCurrency } from '@/lib/data'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExtensionModalProps {
  player: Player | null
  isOpen: boolean
  onClose: () => void
}

export function ExtensionModal({ player, isOpen, onClose }: ExtensionModalProps) {
  const { addSavedContract } = useRoster()
  const [salaries, setSalaries] = useState<Record<Season, string>>({} as Record<Season, string>)

  if (!player) return null

  // Find first season without salary
  const firstEmptySeason = SEASONS.find((s) => !player.salary[s]) as Season | undefined
  if (!firstEmptySeason) return null

  // Get remaining seasons starting from first empty
  const startIndex = SEASONS.indexOf(firstEmptySeason)
  const remainingSeasons = SEASONS.slice(startIndex)

  const handleSalaryChange = (season: Season, value: string) => {
    setSalaries((prev) => ({
      ...prev,
      [season]: value,
    }))
  }

  const handleSave = () => {
    const salaryRecord: Record<Season, number> = {} as Record<Season, number>
    remainingSeasons.forEach((season) => {
      const value = parseFloat(salaries[season] || '0')
      if (value > 0) {
        salaryRecord[season] = value * 1000000 // Convert to full amount
      }
    })

    addSavedContract({
      id: `ext-${player.id}-${Date.now()}`,
      playerName: player.name,
      playerTeam: player.team,
      type: 'extension',
      salary: salaryRecord,
    })

    setSalaries({} as Record<Season, string>)
    onClose()
  }

  const isValid = remainingSeasons.some((s) => salaries[s] && parseFloat(salaries[s]) > 0)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extend {player.name}</DialogTitle>
          <DialogDescription>
            Create a new contract extension starting in {firstEmptySeason}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {remainingSeasons.map((season) => (
            <div key={season} className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor={`salary-${season}`} className="text-xs">
                  {season} Salary (Millions)
                </Label>
                <Input
                  id={`salary-${season}`}
                  type="number"
                  placeholder="0"
                  value={salaries[season] || ''}
                  onChange={(e) => handleSalaryChange(season, e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              {salaries[season] && (
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(parseFloat(salaries[season]) * 1000000)}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1 h-8 text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid} className="flex-1 h-8 text-sm">
            Save Extension
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ExtendButton({
  player,
  onOpenModal,
}: {
  player: Player
  onOpenModal: (player: Player) => void
}) {
  // Find first season without salary
  const firstEmptySeason = SEASONS.find((s) => !player.salary[s])

  if (!firstEmptySeason) return null

  return (
    <button
      onClick={() => onOpenModal(player)}
      className="inline-flex items-center justify-center h-5 w-5 rounded bg-primary/20 hover:bg-primary/30 transition-colors text-primary"
      title={`Extend ${player.name} from ${firstEmptySeason}`}
    >
      <Plus className="h-3 w-3" />
    </button>
  )
}
