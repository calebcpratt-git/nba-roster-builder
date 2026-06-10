'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Player, Season, SEASONS } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS } from '@/lib/data'
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
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface SignFreeAgentModalProps {
  player: Player | null
  startingSeason: Season
  isOpen: boolean
  onClose: () => void
}

type DistributionType = 'flat' | 'escalating' | 'declining'

const DISTRIBUTION_OPTIONS: Record<
  DistributionType,
  { label: string; description: string; shortDescription: string }
> = {
  flat: {
    label: 'Flat',
    description:
      'The same salary every year. Rare in practice since the CBA allows annual raises, and most players want them.',
    shortDescription: 'The same salary every year. Rare in practice.',
  },
  escalating: {
    label: 'Escalating',
    description:
      'Salary increases each year. The standard structure.',
    shortDescription: 'Salary increases each year. The standard structure.',
  },
  declining: {
    label: 'Declining',
    description:
      'Salary decreases each year. Teams use this strategically to push money into earlier years when a player has more value, or to create more cap flexibility in the final year of a deal.',
    shortDescription: 'Salary decreases each year. Strategically defer money.',
  },
}

export function SignFreeAgentModal({ player, startingSeason, isOpen, onClose }: SignFreeAgentModalProps) {
  const { addSavedContract, selectedTeamAbbr, getTotalSalary } = useRoster()
  const [years, setYears] = useState('3')
  const [totalValue, setTotalValue] = useState('')
  const [distribution, setDistribution] = useState<DistributionType>('escalating')
  const [isMinimum, setIsMinimum] = useState(false)
  const [isMLE, setIsMLE] = useState(false)
  const [yearsError, setYearsError] = useState('')

  if (!player) return null

  // Check if team is over the salary cap but under the first apron for this season
  const { total: currentTeamTotal } = getTotalSalary(startingSeason)
  const seasonThresholds = CAP_THRESHOLDS[startingSeason]
  const softCap = seasonThresholds?.find((t) => t.type === 'soft-cap')?.value ?? 0
  const firstApron = seasonThresholds?.find((t) => t.type === 'first-apron')?.value ?? 0
  const isOverCapBelowFirstApron = currentTeamTotal > softCap && currentTeamTotal < firstApron

  // Get remaining seasons starting from the selected year
  const startIndex = SEASONS.indexOf(startingSeason)
  const maxYears = SEASONS.length - startIndex
  const numYears = Math.min(parseInt(years) || 3, isMinimum ? 2 : maxYears)
  const contractSeasons = SEASONS.slice(startIndex, startIndex + numYears)

  // For minimum contracts, total value is fixed
  // For MLE, each year scales from the 2026-27 base of $15.1M proportional to the soft cap
  const minimumTotalValue = numYears === 1 ? 1.2 : 2.5
  const mleSoftCapBase = CAP_THRESHOLDS['2026-27']?.find((t) => t.type === 'soft-cap')?.value ?? 150000000
  const mleTotalValue = contractSeasons.reduce((sum, season) => {
    const seasonSoftCap = CAP_THRESHOLDS[season]?.find((t) => t.type === 'soft-cap')?.value ?? mleSoftCapBase
    return sum + (15.1 * seasonSoftCap) / mleSoftCapBase
  }, 0)
  const totalValueNum = isMinimum ? minimumTotalValue : isMLE ? mleTotalValue : (parseFloat(totalValue) || 0)

  // When over cap but under first apron, fields are locked until a mode is chosen
  const capRestricted = isOverCapBelowFirstApron && !isMinimum && !isMLE

  const handleMinimumToggle = (checked: boolean) => {
    setIsMinimum(checked)
    setYearsError('')
    if (checked) {
      setIsMLE(false)
      setYears('1')
      setDistribution('flat')
    } else {
      setYears('3')
      setDistribution('escalating')
    }
  }

  const handleMLEToggle = (checked: boolean) => {
    setIsMLE(checked)
    if (checked) {
      setIsMinimum(false)
      setYears('3')
      setDistribution('escalating')
    }
  }

  const handleYearsChange = (value: string) => {
    setYearsError('')
    const numValue = parseInt(value)
    if (isMinimum && numValue > 2) {
      setYearsError('Minimum contracts can only be for 1 or 2 years')
      setYears('2')
      return
    }
    setYears(value)
  }

  const calculateSalaries = (): Record<Season, number> => {
    const result: Record<Season, number> = {} as Record<Season, number>
    if (contractSeasons.length === 0) return result

    if (isMLE) {
      contractSeasons.forEach((season) => {
        const seasonSoftCap = CAP_THRESHOLDS[season]?.find((t) => t.type === 'soft-cap')?.value ?? mleSoftCapBase
        result[season] = (15100000 * seasonSoftCap) / mleSoftCapBase
      })
      return result
    }

    if (totalValueNum <= 0) return result
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
      isMinimum: isMinimum,
    })

    setYears('3')
    setTotalValue('')
    setDistribution('escalating')
    setIsMinimum(false)
    setIsMLE(false)
    setYearsError('')
    onClose()
  }

  const isValid = isOverCapBelowFirstApron
    ? (isMinimum || isMLE) && numYears > 0
    : totalValueNum > 0 && numYears > 0

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
          {/* Cap restriction notice + toggles */}
          <div className="space-y-2">
            {isOverCapBelowFirstApron && (
              <p className="text-xs text-amber-500">
                Team is over the salary cap. Only Minimum or Mid-Level Exception contracts are available.
              </p>
            )}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="minimum-contract-fa" className="text-xs font-medium cursor-pointer">
                  Minimum Contract
                </Label>
                <Switch
                  id="minimum-contract-fa"
                  checked={isMinimum}
                  onCheckedChange={handleMinimumToggle}
                  className="data-[state=unchecked]:bg-gray-400"
                />
              </div>
              {isOverCapBelowFirstApron && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="mle-contract-fa" className="text-xs font-medium cursor-pointer">
                    Mid-Level Exception
                  </Label>
                  <Switch
                    id="mle-contract-fa"
                    checked={isMLE}
                    onCheckedChange={handleMLEToggle}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}
            </div>
          </div>

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
                max={isMinimum ? 2 : maxYears}
                value={years}
                onChange={(e) => handleYearsChange(e.target.value)}
                disabled={capRestricted}
                className={cn("h-8 text-sm", yearsError && "border-red-500", capRestricted && "bg-muted cursor-not-allowed")}
              />
              {yearsError && (
                <p className="text-xs text-red-500 mt-1">{yearsError}</p>
              )}
            </div>
            <div>
              <Label htmlFor="total-value" className="text-xs">
                Total Value (Millions)
              </Label>
              <Input
                id="total-value"
                type="number"
                placeholder="0"
                value={isMinimum ? minimumTotalValue.toString() : isMLE ? mleTotalValue.toFixed(1) : totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                disabled={isMinimum || isMLE || capRestricted}
                className={cn("h-8 text-sm", (isMinimum || isMLE || capRestricted) && "bg-muted cursor-not-allowed")}
              />
            </div>
          </div>

          {/* Distribution Type */}
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium whitespace-nowrap">Contract Structure</Label>
            <Select value={distribution} onValueChange={(v) => setDistribution(v as DistributionType)} disabled={isMinimum || isMLE || capRestricted}>
              <SelectTrigger className={cn("flex-1 text-sm justify-start items-start py-2", (isMinimum || isMLE || capRestricted) && "bg-muted cursor-not-allowed opacity-50")} style={{ height: 'auto' }}>
                {distribution && DISTRIBUTION_OPTIONS[distribution] ? (
                  <div className="flex flex-col gap-0.5 text-left w-full">
                    <div className="font-medium text-sm">{DISTRIBUTION_OPTIONS[distribution].label}</div>
                    <p className="text-xs text-muted-foreground whitespace-normal">{DISTRIBUTION_OPTIONS[distribution].shortDescription}</p>
                  </div>
                ) : (
                  <SelectValue placeholder="Select structure" />
                )}
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-40px)]">
                {(Object.entries(DISTRIBUTION_OPTIONS) as [DistributionType, typeof DISTRIBUTION_OPTIONS[DistributionType]][]).map(
                  ([key, { label, description }]) => (
                    <SelectItem key={key} value={key} className="cursor-pointer py-3">
                      <div className="flex flex-col gap-1 max-w-sm">
                        <div className="font-medium text-sm">{label}</div>
                        <p className="text-xs text-muted-foreground whitespace-normal">{description}</p>
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
