'use client'

import { useState, useEffect } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Player, SavedContract, Season, SEASONS } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS } from '@/lib/data'
import {
  getPlayerRookieYear,
  getPlayerYOE,
  getMaxContractPct,
  getMaxContractSalaries,
  getMaxAllowedTotal,
  isLikelyRestrictedFreeAgent,
  DistributionType,
} from '@/lib/contract-utils'
import { getMinimumSalaryThreshold, LEAGUE_CAP } from '@/lib/league-cap'
import { TEAM_CAP_STATE } from '@/lib/team-cap-state'
import { getUsedExceptions } from '@/components/signing-exceptions-panel'
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
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SignFreeAgentModalProps {
  player: Player | null
  startingSeason: Season
  isOpen: boolean
  editingContract?: SavedContract | null
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

function detectDistribution(salary: Partial<Record<Season, number>>): DistributionType {
  const seasons = SEASONS.filter((s) => (salary[s] ?? 0) > 0)
  if (seasons.length <= 1) return 'escalating'
  const values = seasons.map((s) => salary[s]!)
  const ratios = values.slice(1).map((v, i) => v / values[i])
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
  if (Math.abs(avg - 1.0) < 0.01) return 'flat'
  return avg > 1.0 ? 'escalating' : 'declining'
}

type ExceptionType = 'ntmle' | 'tmle' | 'bae'

const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  ntmle: 'Non-Taxpayer MLE',
  tmle: 'Taxpayer MLE',
  bae: 'Bi-Annual Exception',
}
const EXCEPTION_MAX_YEARS: Record<ExceptionType, number> = { ntmle: 4, tmle: 2, bae: 2 }

export function SignFreeAgentModal({ player, startingSeason, isOpen, editingContract, onClose }: SignFreeAgentModalProps) {
  const { addSavedContract, updateSavedContract, setDeletedContractIds, selectedTeamAbbr, getTotalSalary, savedContracts, deletedContractIds } = useRoster()
  const [years, setYears] = useState('3')
  const [totalValue, setTotalValue] = useState('')
  const [distribution, setDistribution] = useState<DistributionType>('escalating')
  const [isMinimum, setIsMinimum] = useState(false)
  const [exceptionType, setExceptionType] = useState<ExceptionType | null>(null)
  const [isMaxContract, setIsMaxContract] = useState(false)
  const [isTwoWay, setIsTwoWay] = useState(false)
  const [isRestrictedFA, setIsRestrictedFA] = useState(false)
  const [isQualifyingOffer, setIsQualifyingOffer] = useState(false)
  const [yearsError, setYearsError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    if (editingContract) {
      const activeSeasons = SEASONS.filter((s) => (editingContract.salary[s] ?? 0) > 0)
      const total = activeSeasons.reduce((sum, s) => sum + (editingContract.salary[s] ?? 0), 0)
      setYears(String(activeSeasons.length || 1))
      setTotalValue((total / 1_000_000).toFixed(2))
      setDistribution(detectDistribution(editingContract.salary))
      setIsMinimum(editingContract.isMinimum ?? false)
      setExceptionType(editingContract.exceptionType ?? null)
      setIsMaxContract(editingContract.isMaxContract ?? false)
      setIsTwoWay(editingContract.contractType === 'two-way')
      setIsRestrictedFA(!!editingContract.rfaPath)
      setIsQualifyingOffer(editingContract.rfaPath === 'qualifying-offer')
      setYearsError('')
    } else {
      setYears('3')
      setTotalValue('')
      setDistribution('escalating')
      setIsMinimum(false)
      setExceptionType(null)
      setIsMaxContract(false)
      setIsTwoWay(false)
      setIsRestrictedFA(player ? isLikelyRestrictedFreeAgent(player.name, startingSeason) : false)
      setIsQualifyingOffer(false)
      setYearsError('')
    }
  }, [isOpen, editingContract?.id, player, startingSeason])

  if (!player) return null

  // When editing an existing contract, anchor to that contract's own first funded season
  // rather than the season the cell that was clicked happens to belong to.
  const editingFirstSeason = editingContract
    ? SEASONS.find((s) => (editingContract.salary[s] ?? 0) > 0)
    : undefined
  const effectiveStartingSeason = (editingFirstSeason ?? startingSeason) as Season

  const isOnSelectedTeam = player.team === selectedTeamAbbr
  // An RFA signing with a different team than the player's own is an offer
  // sheet — min 2/max 4 years, no two-way. Tendering a QO only applies when
  // re-signing your own player.
  const isOfferSheet = isRestrictedFA && !isOnSelectedTeam

  // Cap-room status and apron status are two different numbers (capSpaceTotal
  // strips nothing, apronTotal strips cap holds back out) — which exceptions
  // exist is gated by apron status, matching SigningExceptionsPanel.
  const { capSpaceTotal: currentTeamTotal, apronTotal } = getTotalSalary(effectiveStartingSeason)
  const seasonThresholds = CAP_THRESHOLDS[effectiveStartingSeason]
  const softCap = seasonThresholds?.find((t) => t.type === 'soft-cap')?.value ?? 0
  const firstApron = seasonThresholds?.find((t) => t.type === 'first-apron')?.value ?? 0
  const secondApron = seasonThresholds?.find((t) => t.type === 'second-apron')?.value ?? 0
  const hasCapRoom = currentTeamTotal < softCap
  const isOverSecondApron = apronTotal >= secondApron
  const isOverFirstApronBelowSecondApron = apronTotal >= firstApron && !isOverSecondApron
  const isOverCapBelowFirstApron = !hasCapRoom && apronTotal < firstApron

  // Real per-team "already used" data for the current season, layered with any
  // exception-funded contract already sitting in this builder session — the
  // same source SigningExceptionsPanel reads, so both stay in sync.
  const exceptionsUsed = TEAM_CAP_STATE[selectedTeamAbbr]?.[effectiveStartingSeason]?.exceptionsUsed
  const usedExceptions = getUsedExceptions(
    exceptionsUsed,
    savedContracts.filter((c) => c.id !== editingContract?.id),
    deletedContractIds,
    effectiveStartingSeason
  )
  // The Non-Taxpayer and Taxpayer MLE share a single mid-level allocation per
  // season — once either is spent, both read as used.
  const mleAlreadyUsedForSeason = usedExceptions.has('non-taxpayer-mle') || usedExceptions.has('taxpayer-mle')
  const baeAlreadyUsedForSeason = usedExceptions.has('bi-annual')

  const ntmleAvailable = isOverCapBelowFirstApron && !mleAlreadyUsedForSeason
  const baeAvailable = isOverCapBelowFirstApron && !baeAlreadyUsedForSeason
  const tmleAvailable = isOverFirstApronBelowSecondApron && !mleAlreadyUsedForSeason

  // Seasons / year calculations
  const startIndex = SEASONS.indexOf(effectiveStartingSeason)
  const maxYears = SEASONS.length - startIndex
  const maxYearsAllowed = isQualifyingOffer
    ? 1
    : isMinimum || isTwoWay
    ? 2
    : isMaxContract
    ? Math.min(5, maxYears)
    : exceptionType
    ? Math.min(EXCEPTION_MAX_YEARS[exceptionType], maxYears)
    : isOfferSheet
    ? Math.min(4, maxYears)
    : maxYears
  const numYears = Math.min(parseInt(years) || 3, maxYearsAllowed)
  const contractSeasons = SEASONS.slice(startIndex, startIndex + numYears)

  // Max contract data
  const rookieYear = getPlayerRookieYear(player.name)
  const yoe = rookieYear !== undefined ? getPlayerYOE(rookieYear, effectiveStartingSeason) : undefined
  const maxPct = yoe !== undefined ? getMaxContractPct(yoe) : undefined
  const maxContractSalaries =
    rookieYear !== undefined && contractSeasons.length > 0
      ? getMaxContractSalaries(rookieYear, effectiveStartingSeason, contractSeasons, distribution)
      : null
  const maxAllowedTotalDollars =
    rookieYear !== undefined && contractSeasons.length > 0
      ? getMaxAllowedTotal(rookieYear, effectiveStartingSeason, contractSeasons, distribution)
      : Infinity
  const maxAllowedTotalM = maxAllowedTotalDollars / 1_000_000

  // Minimum totals — cap-hit convention: 2+ YOS players (the common case for a
  // free-agent minimum signing) count against the cap at the two-year-veteran
  // minimum scale, not their real, higher paycheck. Unknown YOS defaults to
  // that veteran tier since this flow is mostly used for established players.
  const minimumTotalValue = contractSeasons.reduce(
    (sum, season) => sum + getMinimumSalaryThreshold(season, yoe ?? 2),
    0
  ) / 1_000_000

  // Exception salaries: each starts at that season's published exception
  // amount and escalates 5%/yr for subsequent contract years — not a total
  // split evenly across an escalating curve.
  const exceptionSalaries = (type: ExceptionType, seasons: Season[]): Partial<Record<Season, number>> => {
    const baseAnnual = LEAGUE_CAP[effectiveStartingSeason]?.exceptions[
      type === 'ntmle' ? 'nonTaxpayerMLE' : type === 'tmle' ? 'taxpayerMLE' : 'biAnnual'
    ] ?? 0
    const result: Partial<Record<Season, number>> = {}
    seasons.forEach((season, index) => {
      result[season] = baseAnnual * Math.pow(1.05, index)
    })
    return result
  }
  const exceptionTotalValue = exceptionType
    ? Object.values(exceptionSalaries(exceptionType, contractSeasons)).reduce((a, b) => a + (b ?? 0), 0) / 1_000_000
    : 0

  const twoWayTotalValue = contractSeasons.reduce(
    (sum, season) => sum + getMinimumSalaryThreshold(season, 0) * 0.5,
    0
  ) / 1_000_000

  const totalValueNum = isTwoWay
    ? twoWayTotalValue
    : isMinimum
    ? minimumTotalValue
    : exceptionType
    ? exceptionTotalValue
    : parseFloat(totalValue) || 0

  const capRestricted =
    !isTwoWay &&
    !isQualifyingOffer &&
    ((isOverSecondApron && !isMinimum) ||
      (isOverFirstApronBelowSecondApron && !isMinimum && !(exceptionType === 'tmle' && tmleAvailable)) ||
      (isOverCapBelowFirstApron &&
        !isMinimum &&
        !((exceptionType === 'ntmle' && ntmleAvailable) || (exceptionType === 'bae' && baeAvailable))))

  // Clamp a total-value string to the current max allowed
  const clampTotalValue = (
    val: string,
    dist: DistributionType,
    seasons: Season[]
  ): string => {
    const num = parseFloat(val)
    if (isNaN(num) || rookieYear === undefined) return val
    const maxM =
      getMaxAllowedTotal(rookieYear, effectiveStartingSeason, seasons, dist) / 1_000_000
    return num > maxM ? maxM.toFixed(2) : val
  }

  const handleMaxContractToggle = (checked: boolean) => {
    setIsMaxContract(checked)
    setYearsError('')
    if (checked) {
      setIsMinimum(false)
      setExceptionType(null)
      setIsTwoWay(false)
      setIsQualifyingOffer(false)
      setTotalValue('')
      if (parseInt(years) > 5) setYears('5')
    }
  }

  const handleMinimumToggle = (checked: boolean) => {
    setIsMinimum(checked)
    setYearsError('')
    if (checked) {
      setIsMaxContract(false)
      setExceptionType(null)
      setIsTwoWay(false)
      setIsQualifyingOffer(false)
      setYears('1')
      setDistribution('flat')
    } else {
      setYears('3')
      setDistribution('escalating')
    }
  }

  const handleExceptionToggle = (type: ExceptionType, checked: boolean) => {
    setExceptionType(checked ? type : null)
    setYearsError('')
    if (checked) {
      setIsMinimum(false)
      setIsMaxContract(false)
      setIsTwoWay(false)
      setIsQualifyingOffer(false)
      setYears(String(Math.min(EXCEPTION_MAX_YEARS[type], maxYears)))
      setDistribution('escalating')
    } else {
      setYears('3')
      setDistribution('escalating')
    }
  }

  const handleTwoWayToggle = (checked: boolean) => {
    setIsTwoWay(checked)
    setYearsError('')
    if (checked) {
      setIsMinimum(false)
      setExceptionType(null)
      setIsMaxContract(false)
      setIsQualifyingOffer(false)
      if (parseInt(years) > 2) setYears('2')
      setDistribution('flat')
    } else {
      setYears('3')
      setDistribution('escalating')
    }
  }

  // Gates whether the QO sub-toggle is even shown — turning it off when
  // switching to a different team (offer-sheet mode) or off entirely.
  const handleRestrictedFAToggle = (checked: boolean) => {
    setIsRestrictedFA(checked)
    setIsQualifyingOffer(false)
    setYearsError('')
    if (checked && isOfferSheet) {
      setIsTwoWay(false)
      const clamped = Math.min(Math.max(parseInt(years) || 2, 2), Math.min(4, maxYears))
      setYears(String(clamped))
    }
  }

  const handleQualifyingOfferToggle = (checked: boolean) => {
    setIsQualifyingOffer(checked)
    setYearsError('')
    if (checked) {
      setIsMinimum(false)
      setIsMaxContract(false)
      setExceptionType(null)
      setIsTwoWay(false)
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
    if (isQualifyingOffer && numValue !== 1) {
      setYearsError('A qualifying offer is always 1 year')
      setYears('1')
      return
    }
    if (isMinimum && numValue > 2) {
      setYearsError('Minimum contracts can only be for 1 or 2 years')
      setYears('2')
      return
    }
    if (isTwoWay && numValue > 2) {
      setYearsError('Two-way contracts can only be for 1 or 2 years')
      setYears('2')
      return
    }
    if (isMaxContract && numValue > 5) {
      setYearsError('Maximum contracts can only be for up to 5 years')
      setYears('5')
      return
    }
    if (isOfferSheet && numValue > 4) {
      setYearsError('Offer sheets can run at most 4 years')
      setYears('4')
      return
    }
    if (isOfferSheet && numValue < 2) {
      setYearsError('Offer sheets must run at least 2 years')
      setYears('2')
      return
    }
    setYears(value)
    // Clamp total value against the new seasons
    if (!isMaxContract && !isMinimum && !exceptionType && totalValue) {
      const newNumYears = Math.min(numValue || 3, isMaxContract ? Math.min(5, maxYears) : maxYears)
      const newSeasons = SEASONS.slice(startIndex, startIndex + newNumYears)
      setTotalValue(clampTotalValue(totalValue, distribution, newSeasons))
    }
  }

  const handleDistributionChange = (v: DistributionType) => {
    setDistribution(v)
    if (!isMaxContract && !isMinimum && !exceptionType && totalValue) {
      setTotalValue(clampTotalValue(totalValue, v, contractSeasons))
    }
  }

  const handleTotalValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!isMaxContract && !isMinimum && !exceptionType) {
      setTotalValue(clampTotalValue(val, distribution, contractSeasons))
    } else {
      setTotalValue(val)
    }
  }

  const calculateSalaries = (): Partial<Record<Season, number>> => {
    if (isMaxContract && maxContractSalaries) return maxContractSalaries

    const result: Partial<Record<Season, number>> = {}
    if (contractSeasons.length === 0) return result

    if (isTwoWay) {
      contractSeasons.forEach((season) => {
        result[season] = getMinimumSalaryThreshold(season, 0) * 0.5
      })
      return result
    }

    if (exceptionType) {
      return exceptionSalaries(exceptionType, contractSeasons)
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

  const totalValueDisplayed = isTwoWay
    ? twoWayTotalValue.toFixed(2)
    : isMinimum
    ? minimumTotalValue.toString()
    : exceptionType
    ? exceptionTotalValue.toFixed(1)
    : isMaxContract
    ? maxContractTotalM.toFixed(1)
    : totalValue

  const resetForm = () => {
    setYears('3')
    setTotalValue('')
    setDistribution('escalating')
    setIsMinimum(false)
    setExceptionType(null)
    setIsMaxContract(false)
    setIsTwoWay(false)
    setIsRestrictedFA(false)
    setIsQualifyingOffer(false)
    setYearsError('')
  }

  // Preserves the matched badge if editing a contract matchOfferSheet already
  // created; otherwise derives rfaPath from the toggles above.
  const rfaPath: SavedContract['rfaPath'] = !isRestrictedFA
    ? undefined
    : isQualifyingOffer
    ? 'qualifying-offer'
    : isOnSelectedTeam
    ? (editingContract?.rfaPath === 'matched-offer-sheet' ? 'matched-offer-sheet' : undefined)
    : 'offer-sheet'

  const handleSave = () => {
    if (editingContract) {
      updateSavedContract({
        ...editingContract,
        salary: salaries,
        isMinimum: isMinimum,
        exceptionType: exceptionType ?? undefined,
        isMaxContract: isMaxContract,
        contractType: isTwoWay ? 'two-way' : undefined,
        rfaPath,
      })
    } else {
      addSavedContract({
        id: `fa-${player.id}-${Date.now()}`,
        playerId: player.id,
        playerName: player.name,
        type: isOnSelectedTeam ? 'extension' : 'free-agent',
        salary: salaries,
        createdAt: new Date(),
        isMinimum: isMinimum,
        exceptionType: exceptionType ?? undefined,
        isMaxContract: isMaxContract,
        contractType: isTwoWay ? 'two-way' : undefined,
        rfaPath,
      })
    }

    resetForm()
    onClose()
  }

  const handleDelete = () => {
    if (!editingContract) return
    const newDeleted = new Set(deletedContractIds)
    newDeleted.add(editingContract.id)
    setDeletedContractIds(newDeleted)
    resetForm()
    onClose()
  }

  const meetsOfferSheetTermBand = !isOfferSheet || (numYears >= 2 && numYears <= 4)

  const isValid = isQualifyingOffer
    ? totalValueNum > 0 && numYears === 1
    : meetsOfferSheetTermBand &&
      (isTwoWay
        ? numYears > 0
        : isOverSecondApron
        ? isMinimum && numYears > 0
        : isOverFirstApronBelowSecondApron
        ? (isMinimum || (exceptionType === 'tmle' && tmleAvailable)) && numYears > 0
        : isOverCapBelowFirstApron
        ? (isMinimum || (exceptionType === 'ntmle' && ntmleAvailable) || (exceptionType === 'bae' && baeAvailable)) && numYears > 0
        : isMaxContract
        ? numYears > 0 && maxContractSalaries !== null
        : totalValueNum > 0 && numYears > 0)

  const isTotalValueDisabled = isMinimum || !!exceptionType || isMaxContract || isTwoWay || capRestricted

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingContract ? `Edit ${player.name}'s Contract` : `Sign ${player.name}`}</DialogTitle>
          <DialogDescription>
            {editingContract
              ? 'Update the terms of this contract'
              : `Create a new contract starting in ${effectiveStartingSeason}`}
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
                Team is over the first apron. {tmleAvailable ? 'Minimum or Taxpayer MLE contracts are available.' : 'The Taxpayer MLE has already been used — only a minimum contract is available.'}
              </p>
            )}
            {isOverCapBelowFirstApron && (ntmleAvailable || baeAvailable) && (
              <p className="text-xs text-amber-500">
                Team is over the salary cap. Minimum{ntmleAvailable ? ', Non-Taxpayer MLE' : ''}{baeAvailable ? ', or Bi-Annual Exception' : ''} contracts are available.
              </p>
            )}
            {isOverCapBelowFirstApron && !ntmleAvailable && !baeAvailable && (
              <p className="text-xs text-amber-500">
                Team is over the salary cap and has already used its Mid-Level and Bi-Annual Exceptions for {effectiveStartingSeason}. Only a minimum contract is available.
              </p>
            )}

            {/* Contract type toggles */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Label htmlFor="restricted-fa" className="text-xs font-medium cursor-pointer">
                  Restricted Free Agent
                </Label>
                <Switch
                  id="restricted-fa"
                  checked={isRestrictedFA}
                  onCheckedChange={handleRestrictedFAToggle}
                  className="data-[state=unchecked]:bg-gray-400"
                />
              </div>

              {isRestrictedFA && isOnSelectedTeam && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="qualifying-offer" className="text-xs font-medium cursor-pointer">
                    Tender Qualifying Offer
                  </Label>
                  <Switch
                    id="qualifying-offer"
                    checked={isQualifyingOffer}
                    onCheckedChange={handleQualifyingOfferToggle}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}

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

              {ntmleAvailable && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="ntmle-contract-fa" className="text-xs font-medium cursor-pointer">
                    Non-Taxpayer MLE
                  </Label>
                  <Switch
                    id="ntmle-contract-fa"
                    checked={exceptionType === 'ntmle'}
                    onCheckedChange={(checked) => handleExceptionToggle('ntmle', checked)}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}

              {tmleAvailable && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="tmle-contract-fa" className="text-xs font-medium cursor-pointer">
                    Taxpayer MLE
                  </Label>
                  <Switch
                    id="tmle-contract-fa"
                    checked={exceptionType === 'tmle'}
                    onCheckedChange={(checked) => handleExceptionToggle('tmle', checked)}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}

              {baeAvailable && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="bae-contract-fa" className="text-xs font-medium cursor-pointer">
                    Bi-Annual Exception
                  </Label>
                  <Switch
                    id="bae-contract-fa"
                    checked={exceptionType === 'bae'}
                    onCheckedChange={(checked) => handleExceptionToggle('bae', checked)}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}

              {!isOfferSheet && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="two-way-contract-fa" className="text-xs font-medium cursor-pointer">
                    Two-Way Contract
                  </Label>
                  <Switch
                    id="two-way-contract-fa"
                    checked={isTwoWay}
                    onCheckedChange={handleTwoWayToggle}
                    className="data-[state=unchecked]:bg-gray-400"
                  />
                </div>
              )}
            </div>

            {isQualifyingOffer && (
              <p className="text-xs text-muted-foreground">
                A qualifying offer is a 1-year, fully guaranteed deal that gives {player.team} matching rights over
                any offer sheet {player.name} signs elsewhere. Enter the QO amount manually.
              </p>
            )}

            {isOfferSheet && (
              <p className="text-xs text-muted-foreground">
                Offer sheet — must run 2–4 years and can&apos;t be a two-way deal. {player.team} will have a chance to
                match; if they do, {player.name} can&apos;t be traded without his consent for one year, and never to{' '}
                {selectedTeamAbbr} even with it.
              </p>
            )}

            {isTwoWay && (
              <p className="text-xs text-muted-foreground">
                50% of the 0-YOS minimum, flat, 1–2 years. Excluded from Team Salary entirely and counts against the
                team&apos;s 3 two-way slots{yoe !== undefined && yoe > 4 ? ' — note: players with more than 4 YOS are not eligible for a two-way deal' : ''}.
              </p>
            )}

            {exceptionType && (
              <p className="text-xs text-muted-foreground">
                {EXCEPTION_LABELS[exceptionType]}: up to {EXCEPTION_MAX_YEARS[exceptionType]} years, 5% annual raises
                {exceptionType === 'tmle' ? ' — signings only, and it hard-caps the team at the second apron for the rest of the year' : ''}.
              </p>
            )}

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
                min={isOfferSheet ? 2 : 1}
                max={maxYearsAllowed}
                value={years}
                onChange={(e) => handleYearsChange(e.target.value)}
                disabled={capRestricted || isQualifyingOffer}
                className={cn('h-8 text-sm', yearsError && 'border-red-500', capRestricted && 'bg-muted cursor-not-allowed')}
              />
              {yearsError && <p className="text-xs text-red-500 mt-1">{yearsError}</p>}
            </div>
            <div>
              <Label htmlFor="total-value" className="text-xs">
                Total Value (Millions)
                {!isMaxContract && !isMinimum && !exceptionType && maxAllowedTotalM < Infinity && (
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
              disabled={isMinimum || !!exceptionType || isTwoWay || capRestricted}
            >
              <SelectTrigger
                className={cn(
                  'flex-1 text-sm justify-start items-start py-2',
                  (isMinimum || !!exceptionType || isTwoWay || capRestricted) && 'bg-muted cursor-not-allowed opacity-50'
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
          {editingContract && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="h-8 text-sm text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              title="Delete this contract"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="flex-1 h-8 text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid} className="flex-1 h-8 text-sm">
            {editingContract ? 'Save Changes' : 'Save Contract'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
