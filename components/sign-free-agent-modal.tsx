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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SignFreeAgentModalProps {
  player: Player | null
  startingSeason: Season
  isOpen: boolean
  onClose: () => void
}

type DistributionType = 'flat' | 'escalating' | 'declining'

const DISTRIBUTION_OPTIONS: Record<
  DistributionType,
  { label: string; description: string }
> = {
  flat: {
    label: 'Flat',
    description:
      'The same salary every year. Rare in practice since the CBA allows annual raises, and most players want them.',
  },
  escalating: {
    label: 'Escalating',
    description:
      'Salary increases each year. The standard structure.',
  },
  declining: {
    label: 'Declining',
    description:
      'Salary decreases each year. Teams use this strategically to push money into earlier years when a player has more value, or to create more cap flexibility in the final year of a deal.',
  },
}

export function SignFreeAgentModal({ player, startingSeason, isOpen, onClose }: SignFreeAgentModalProps) {
  const { addSavedContract, selectedTeamAbbr } = useRoster()
  const [years, setYears] = useState('3')
  const [totalValue, setTotalValue] = useState('')
  const [distribution, setDistribution] = useState<DistributionType>('escalating')

  if (!player) return null

  // Get remaining seasons starting from the selected year
  const startIndex = SEASONS.indexOf(startingSeason)
  const maxYears = SEASONS.length - startIndex
  const numYears = Math.min(parseInt(years) || 3, maxYears)
  const contractSeasons = SEASONS.slice(startIndex, startIndex + numYears)
  const totalValueNum = parseFloat(totalValue) || 0

  const calculateSalaries = (): Record<Season, number> => {
    const result: Record<Season, number> = {} as Record<Season, number>
    if (totalValueNum <= 0 || contractSeasons.length === 0) return result

    const totalInDollars = totalValueNum * 1000000

    if (distribution === 'flat') {
      const yearSalary = totalInDollars / contractSeasons.length
      contractSeasons.forEach((season) => {
        result[season] = yearSalary
      })
    } else if (distribution === 'escalating') {
      const n = contractSeasons.length
      const rate = 1.05
      const divisor = (1 - Math.pow(rate, n)) / (1 - rate)
      const firstYearSalary = totalInDollars / divisor

      contractSeasons.forEach((season, index) => {
        result[season] = firstYearSalary * Math.pow(rate, index)
      })
    } else if (distribution === 'declining') {
      const n = contractSeasons.length
      const rate = 0.95
      const divisor = (1 - Math.pow(rate, n)) / (1 - rate)
      const firstYearSalary = totalInDollars / divisor

      contractSeasons.forEach((season, index) => {
        result[season] = firstYearSalary * Math.pow(rate, index)
      })
    }

    return result
  }

  const salaries = calculateSalaries()
  const totalCalculated = Object.values(salaries).reduce((a, b) => a + b, 0)

  const handleSave = () => {
    // Check if player is on the currently selected team
    const isOnSelectedTeam = player.team === selectedTeamAbbr

    addSavedContract({
      id: `fa-${player.id}-${Date.now()}`,
      playerId: player.id,
      playerName: player.name,
      type: isOnSelectedTeam ? 'extension' : 'free-agent',
      salary: salaries,
      createdAt: new Date(),
    })

    setYears('3')
    setTotalValue('')
    setDistribution('escalating')
    onClose()
  }

  const isValid = totalValueNum > 0 && numYears > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign {player.name}</DialogTitle>
          <DialogDescription>
            Create a new contract starting in {startingSeason}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Years and Total Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="years" className="text-xs">
                Years
              </Label>
              <Input
                id="years"
                type="number"
                min="1"
                max={maxYears}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="total-value" className="text-xs">
                Total Value (Millions)
              </Label>
              <Input
                id="total-value"
                type="number"
                placeholder="0"
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Distribution Type */}
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium whitespace-nowrap">Contract Structure</Label>
            <Select value={distribution} onValueChange={(v) => setDistribution(v as DistributionType)}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Select structure" />
              </SelectTrigger>
              <SelectContent className="w-full">
                {(Object.entries(DISTRIBUTION_OPTIONS) as [DistributionType, typeof DISTRIBUTION_OPTIONS[DistributionType]][]).map(
                  ([key, { label, description }]) => (
                    <SelectItem key={key} value={key} className="cursor-pointer py-2">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium text-sm">{label}</div>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          {isValid && (
            <div className="bg-muted/30 rounded p-2.5">
              <p className="text-xs font-medium mb-1.5">Contract Preview</p>
              <div className="space-y-1">
                {contractSeasons.map((season) => (
                  <div key={season} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{season}</span>
                    <span className="font-mono">{formatCurrency(salaries[season])}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-1.5 pt-1.5 flex justify-between text-xs font-medium">
                <span>Total</span>
                <span className="font-mono">{formatCurrency(totalCalculated)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1 h-8 text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid} className="flex-1 h-8 text-sm">
            Save Contract
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
