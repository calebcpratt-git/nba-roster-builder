'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Player, Season, SEASONS } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS } from '@/lib/data'
import {
  getPlayerRookieYear,
  getPlayerYOE,
  getMaxContractPct,
  getMaxContractSalaries,
  getMaxAllowedTotal,
  DistributionType,
} from '@/lib/contract-utils'
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
    description: 'Salary increases each year. The standard structure.',
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
  const { addSavedContract, selectedTeamAbbr, getTotalSalary, savedContracts, deletedContractIds } = useRoster()
  const [years, setYears] = useState('3')
  const [totalValue, setTotalValue] = useState('')
  const [distribution, setDistribution] = useState<DistributionType>('escalating')
  const [isMinimum, setIsMinimum] = useState(false)
  const [isMLE, setIsMLE] = useState(false)
  const [isMaxContract, setIsMaxContract] = useState(false)
  const [yearsError, setYearsError] = useState('')

  if (!player) return null

  // Cap threshold checks
  const { total: currentTeamTotal } = getTotalSalary(startingSeason)
  const seasonThresholds = CAP_THRESHOLDS[startingSeason]
  const softCap = seasonThresholds?.find((t) => t.type === 'soft-cap')?.value ?? 0
  const firstApron = seasonThresholds?.find((t) => t.type === 'first-apron')?.value ?? 0
  const secondApron = seasonThresholds?.find((t) => t.type === 'second-apron')?.value ?? 0
  const isOverSecondApron = currentTeamTotal > secondApron
  const isOverFirstApronBelowSecondApron = currentTeamTotal > firstApron && !isOverSecondApron
  const isOverCapBelowFirstApron = currentTeamTotal > softCap && currentTeamTotal < firstApron

  const mleAlreadyUsedForSeason = savedContracts.some(
    (c) =>
      c.isMLE &&
      !deletedContractIds.has(c.id) &&
      SEASONS.find((s) => (c.salary[s] ?? 0) > 0) === startingSeason
  )
  const mleAvailable = isOverCapBelowFirstApron && !mleAlreadyUsedForSeason && !isOverSecondApron

  // Seasons / year calculations
  const startIndex = SEASONS.indexOf(startingSeason)
  const maxYears = SEASONS.length - startIndex
  const maxYearsAllowed = isMinimum ? 2 : isMaxContract ? Math.min(5, maxYears) : maxYears
  const numYears = Math.min(parseInt(years) || 3, maxYearsAllowed)
  const contractSeasons = SEASONS.slice(startIndex, startIndex + numYears)

  // Max contract data
  const rookieYear = getPlayerRookieYear(player.name)
  const yoe = rookieYear !== undefined ? getPlayerYOE(rookieYear, startingSeason) : undefined
  const maxPct = yoe !== undefined ? getMaxContractPct(yoe) : undefined
  const maxContractSalaries =
    rookieYear !== undefined && contractSeasons.length > 0
      ? getMaxContractSalaries(rookieYear, startingSeason, contractSeasons, distribution)
      : null
  const maxAllowedTotalDollars =
    rookieYear !== undefined && contractSeasons.length > 0
      ? getMaxAllowedTotal(rookieYear, startingSeason, contractSeasons, distribution)
      : Infinity
  const maxAllowedTotalM = maxAllowedTotalDollars / 1_000_000

  // Minimum / MLE totals
  const minimumTotalValue = numYears === 1 ? 1.2 : 2.5
  const mleSoftCapBase = CAP_THRESHOLDS['2026-27']?.find((t) => t.type === 'soft-cap')?.value ?? 150000000
  const mleTotalValue = contractSeasons.reduce((sum, season) => {
    const seasonSoftCap = CAP_THRESHOLDS[season]?.find((t) => t.type === 'soft-cap')?.value ?? mleSoftCapBase
    return sum + (15.1 * seasonSoftCap) / mleSoftCapBase
  }, 0)

  const totalValueNum = isMinimum
    ? minimumTotalValue
    : isMLE
    ? mleTotalValue
    : parseFloat(totalValue) || 0

  const capRestricted =
    (isOverSecondApron && !isMinimum) ||
    (isOverFirstApronBelowSecondApron && !isMinimum) ||
    (isOverCapBelowFirstApron && !isMinimum && !(isMLE && mleAvailable))

  // Clamp a total-value string to the current max allowed
  const clampTotalValue = (
    val: string,
    dist: DistributionType,
    seasons: Season[]
  ): string => {
    const num = parseFloat(val)
    if (isNaN(num) || rookieYear === undefined) return val
    const maxM =
      getMaxAllowedTotal(rookieYear, startingSeason, seasons, dist) / 1_000_000
    return num > maxM ? maxM.toFixed(2) : val
  }

  const handleMaxContractToggle = (checked: boolean) => {
    setIsMaxContract(checked)
    setYearsError('')
    if (checked) {
      setIsMinimum(false)
      setIsMLE(false)
      setTotalValue('')
      if (parseInt(years) > 5) setYears('5')
    }
  }

  const handleMinimumToggle = (checked: boolean) => {
    setIsMinimum(checked)
    setYearsError('')
    if (checked) {
      setIsMaxContract(false)
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
      setIsMaxContract(false)
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
    if (isMaxContract && numValue > 5) {
      setYearsError('Maximum contracts can only be for up to 5 years')
      setYears('5')
      return
    }
    setYears(value)
    // Clamp total value against the new seasons
    if (!isMaxContract && !isMinimum && !isMLE && totalValue) {
      const newNumYears = Math.min(numValue || 3, isMaxContract ? Math.min(5, maxYears) : maxYears)
      const newSeasons = SEASONS.slice(startIndex, startIndex + newNumYears)
      setTotalValue(clampTotalValue(totalValue, distribution, newSeasons))
    }
  }

  const handleDistributionChange = (v: DistributionType) => {
    setDistribution(v)
    if (!isMaxContract && !isMinimum && !isMLE && totalValue) {
      setTotalValue(clampTotalValue(totalValue, v, contractSeasons))
    }
  }

  const handleTotalValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!isMaxContract && !isMinimum && !isMLE) {
      setTotalValue(clampTotalValue(val, distribution, contractSeasons))
    } else {
      setTotalValue(val)
    }
  }

  const calculateSalaries = (): Partial<Record<Season, number>> => {
    if (isMaxContract && maxContractSalaries) return maxContractSalaries

    const result: Partial<Record<Season, number>> = {}
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
      contractSeasons.forEach((season) => { result[season] = yearSalary })
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
  const totalCalculated = Object.values(salaries).reduce((a, b) => a + (b ?? 0), 0)

  const maxContractTotalM = maxContractSalaries
    ? Object.values(maxContractSalaries).reduce((a, b) => a + (b ?? 0), 0) / 1_000_000
    : 0

  const totalValueDisplayed = isMinimum
    ? minimumTotalValue.toString()
    : isMLE
    ? mleTotalValue.toFixed(1)
    : isMaxContract
    ? maxContractTotalM.toFixed(1)
    : totalValue

  const handleSave = () => {
    const isOnSelectedTeam = player.team === selectedTeamAbbr
    addSavedContract({
      id: `fa-${player.id}-${Date.now()}`,
      playerId: player.id,
      playerName: player.name,
      type: isOnSelectedTeam ? 'extension' : 'free-agent',
      salary: salaries,
      createdAt: new Date(),
      isMinimum: isMinimum,
      isMLE: isMLE,
    })

    setYears('3')
    setTotalValue('')
    setDistribution('escalating')
    setIsMinimum(false)
    setIsMLE(false)
    setIsMaxContract(false)
    setYearsError('')
    onClose()
  }

  const isValid = isOverSecondApron || isOverFirstApronBelowSecondApron
    ? isMinimum && numYears > 0
    : isOverCapBelowFirstApron
    ? (isMinimum || (isMLE && mleAvailable)) && numYears > 0
    : isMaxContract
    ? numYears > 0 && maxContractSalaries !== null
    : totalValueNum > 0 && numYears > 0

  const isTotalValueDisabled = isMinimum || isMLE || isMaxContract || capRestricted

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
          {/* Cap restriction notices */}
          <div className="space-y-2">
            {isOverSecondApron && (
              <p className="text-xs text-red-500">
                Team is over the second apron. Only minimum contracts are available.
              </p>
            )}
            {isOverFirstApronBelowSecondApron && (
              <p className="text-xs text-red-500">
                Team is over the first apron. Only minimum contracts are available.
              </p>
            )}
            {!isOverSecondApron && !isOverFirstApronBelowSecondApron && isOverCapBelowFirstApron && !mleAlreadyUsedForSeason && (
              <p className="text-xs text-amber-500">
                Team is over the salary cap. Only Minimum or Mid-Level Exception contracts are available.
              </p>
            )}
            {!isOverSecondApron && !isOverFirstApronBelowSecondApron && isOverCapBelowFirstApron && mleAlreadyUsedForSeason && (
              <p className="text-xs text-amber-500">
                Team is over the salary cap and has already used the MLE for {startingSeason}. Only a minimum contract is available.
              </p>
            )}

            {/* Contract type toggles */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Maximum Contract — shown when cap allows non-minimum contracts */}
              {!isOverSecondApron && !isOverFirstApronBelowSecondApron && !(isOverCapBelowFirstApron) && rookieYear !== undefined && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="max-contract-fa" className="text-xs font-medium cursor-pointer">
                    Maximum Contract
                  </Label>
                  <Switch
                    id="max-contract-fa"
                    checked={isMaxContract}
                    onCheckedChange={handleMaxContractToggle}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}

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

              {mleAvailable && (
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

            {/* Max contract info line */}
            {!isOverSecondApron && !isOverFirstApronBelowSecondApron && !isOverCapBelowFirstApron && yoe !== undefined && maxPct !== undefined && (
              <p className="text-xs text-muted-foreground">
                {player.name} has {yoe} YOE — max contract is{' '}
                <span className="font-medium">{(maxPct * 100).toFixed(0)}%</span> of the cap
                {isMaxContract && maxAllowedTotalM < Infinity && (
                  <span className="text-foreground"> · Max total: <span className="font-medium">${maxAllowedTotalM.toFixed(1)}M</span></span>
                )}
              </p>
            )}
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
                max={maxYearsAllowed}
                value={years}
                onChange={(e) => handleYearsChange(e.target.value)}
                disabled={capRestricted}
                className={cn('h-8 text-sm', yearsError && 'border-red-500', capRestricted && 'bg-muted cursor-not-allowed')}
              />
              {yearsError && <p className="text-xs text-red-500 mt-1">{yearsError}</p>}
            </div>
            <div>
              <Label htmlFor="total-value" className="text-xs">
                Total Value (Millions)
                {!isMaxContract && !isMinimum && !isMLE && maxAllowedTotalM < Infinity && (
                  <span className="text-muted-foreground font-normal"> · max ${maxAllowedTotalM.toFixed(1)}M</span>
                )}
              </Label>
              <Input
                id="total-value"
                type="number"
                placeholder="0"
                value={totalValueDisplayed}
                onChange={handleTotalValueChange}
                disabled={isTotalValueDisabled}
                className={cn('h-8 text-sm', isTotalValueDisabled && 'bg-muted cursor-not-allowed')}
              />
            </div>
          </div>

          {/* Distribution Type */}
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium whitespace-nowrap">Contract Structure</Label>
            <Select
              value={distribution}
              onValueChange={(v) => handleDistributionChange(v as DistributionType)}
              disabled={isMinimum || isMLE || capRestricted}
            >
              <SelectTrigger
                className={cn(
                  'flex-1 text-sm justify-start items-start py-2',
                  (isMinimum || isMLE || capRestricted) && 'bg-muted cursor-not-allowed opacity-50'
                )}
                style={{ height: 'auto' }}
              >
                {distribution && DISTRIBUTION_OPTIONS[distribution] ? (
                  <div className="flex flex-col gap-0.5 text-left w-full">
                    <div className="font-medium text-sm">{DISTRIBUTION_OPTIONS[distribution].label}</div>
                    <p className="text-xs text-muted-foreground whitespace-normal">
                      {DISTRIBUTION_OPTIONS[distribution].shortDescription}
                    </p>
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
                    <span className="font-mono">{formatCurrency(salaries[season] ?? 0)}</span>
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
