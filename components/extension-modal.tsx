'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Player, Season, SEASONS } from '@/lib/types'
import { formatCurrency } from '@/lib/data'
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
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExtensionModalProps {
  player: Player | null
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

export function ExtensionModal({ player, isOpen, onClose }: ExtensionModalProps) {
  const { addSavedContract } = useRoster()
  const [years, setYears] = useState('3')
  const [totalValue, setTotalValue] = useState('')
  const [distribution, setDistribution] = useState<DistributionType>('escalating')
  const [isMinimum, setIsMinimum] = useState(false)
  const [isMaxContract, setIsMaxContract] = useState(false)
  const [yearsError, setYearsError] = useState('')

  if (!player) return null

  const firstEmptySeason = SEASONS.find((s) => !player.salary[s]) as Season | undefined
  if (!firstEmptySeason) return null

  const startIndex = SEASONS.indexOf(firstEmptySeason)
  const maxYears = SEASONS.length - startIndex
  const maxYearsAllowed = isMinimum ? 2 : isMaxContract ? Math.min(5, maxYears) : maxYears
  const numYears = Math.min(parseInt(years) || 3, maxYearsAllowed)
  const contractSeasons = SEASONS.slice(startIndex, startIndex + numYears)

  // Max contract data
  const rookieYear = getPlayerRookieYear(player.name)
  const yoe = rookieYear !== undefined ? getPlayerYOE(rookieYear, firstEmptySeason) : undefined
  const maxPct = yoe !== undefined ? getMaxContractPct(yoe) : undefined
  const maxContractSalaries =
    rookieYear !== undefined && contractSeasons.length > 0
      ? getMaxContractSalaries(rookieYear, firstEmptySeason, contractSeasons, distribution)
      : null
  const maxAllowedTotalDollars =
    rookieYear !== undefined && contractSeasons.length > 0
      ? getMaxAllowedTotal(rookieYear, firstEmptySeason, contractSeasons, distribution)
      : Infinity
  const maxAllowedTotalM = maxAllowedTotalDollars / 1_000_000

  const minimumTotalValue = numYears === 1 ? 1.32 : 2.75
  const totalValueNum = isMinimum ? minimumTotalValue : parseFloat(totalValue) || 0

  const clampTotalValue = (
    val: string,
    dist: DistributionType,
    seasons: Season[]
  ): string => {
    const num = parseFloat(val)
    if (isNaN(num) || rookieYear === undefined) return val
    const maxM = getMaxAllowedTotal(rookieYear, firstEmptySeason, seasons, dist) / 1_000_000
    return num > maxM ? maxM.toFixed(2) : val
  }

  const handleMaxContractToggle = (checked: boolean) => {
    setIsMaxContract(checked)
    setYearsError('')
    if (checked) {
      setIsMinimum(false)
      setTotalValue('')
      if (parseInt(years) > 5) setYears('5')
    }
  }

  const handleMinimumToggle = (checked: boolean) => {
    setIsMinimum(checked)
    setYearsError('')
    if (checked) {
      setIsMaxContract(false)
      setYears('1')
      setDistribution('flat')
    } else {
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
    if (!isMaxContract && !isMinimum && totalValue) {
      const newNumYears = Math.min(numValue || 3, isMaxContract ? Math.min(5, maxYears) : maxYears)
      const newSeasons = SEASONS.slice(startIndex, startIndex + newNumYears)
      setTotalValue(clampTotalValue(totalValue, distribution, newSeasons))
    }
  }

  const handleDistributionChange = (v: DistributionType) => {
    setDistribution(v)
    if (!isMaxContract && !isMinimum && totalValue) {
      setTotalValue(clampTotalValue(totalValue, v, contractSeasons))
    }
  }

  const handleTotalValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!isMaxContract && !isMinimum) {
      setTotalValue(clampTotalValue(val, distribution, contractSeasons))
    } else {
      setTotalValue(val)
    }
  }

  const calculateSalaries = (): Partial<Record<Season, number>> => {
    if (isMaxContract && maxContractSalaries) return maxContractSalaries

    const result: Partial<Record<Season, number>> = {}
    if (totalValueNum <= 0 || contractSeasons.length === 0) return result
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
    : isMaxContract
    ? maxContractTotalM.toFixed(1)
    : totalValue

  const handleSave = () => {
    addSavedContract({
      id: `ext-${player.id}-${Date.now()}`,
      playerId: player.id,
      playerName: player.name,
      type: 'extension',
      salary: salaries,
      createdAt: new Date(),
      isMinimum: isMinimum,
    })

    setYears('3')
    setTotalValue('')
    setDistribution('escalating')
    setIsMinimum(false)
    setIsMaxContract(false)
    setYearsError('')
    onClose()
  }

  const isValid = isMaxContract
    ? numYears > 0 && maxContractSalaries !== null
    : totalValueNum > 0 && numYears > 0

  const isTotalValueDisabled = isMinimum || isMaxContract

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extend {player.name}</DialogTitle>
          <DialogDescription>
            Create a new contract extension starting in {firstEmptySeason}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contract type toggles */}
          <div className="space-y-2">
            <div className="flex items-center gap-4 flex-wrap">
              {rookieYear !== undefined && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="max-contract-ext" className="text-xs font-medium cursor-pointer">
                    Maximum Contract
                  </Label>
                  <Switch
                    id="max-contract-ext"
                    checked={isMaxContract}
                    onCheckedChange={handleMaxContractToggle}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Label htmlFor="minimum-contract" className="text-xs font-medium cursor-pointer">
                  Minimum Contract
                </Label>
                <Switch
                  id="minimum-contract"
                  checked={isMinimum}
                  onCheckedChange={handleMinimumToggle}
                  className="data-[state=unchecked]:bg-gray-400"
                />
              </div>
            </div>

            {yoe !== undefined && maxPct !== undefined && (
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
                className={cn('h-8 text-sm', yearsError && 'border-red-500')}
              />
              {yearsError && <p className="text-xs text-red-500 mt-1">{yearsError}</p>}
            </div>
            <div>
              <Label htmlFor="total-value" className="text-xs">
                Total Value (Millions)
                {!isMaxContract && !isMinimum && maxAllowedTotalM < Infinity && (
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
              disabled={isMinimum}
            >
              <SelectTrigger
                className={cn('flex-1 text-sm justify-start items-start py-2', isMinimum && 'bg-muted cursor-not-allowed opacity-50')}
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
  return (
    <button
      onClick={() => onOpenModal(player)}
      className="inline-flex items-center justify-center text-emerald-500 hover:text-emerald-600 transition-colors"
      title={`Extend ${player.name}`}
    >
      <Plus className="h-4 w-4" />
    </button>
  )
}
