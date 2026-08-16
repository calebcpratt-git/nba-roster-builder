'use client'

import { useState, useEffect } from 'react'
import { useRoster } from '@/lib/roster-context'
import { Player, SavedContract, Season, SEASONS } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS, TEAM_NAMES } from '@/lib/data'
import {
  getPlayerRookieYear,
  getPlayerYOE,
  getMaxContractPct,
  getMaxContractSalaries,
  getMaxAllowedTotal,
  isRestrictedFreeAgent,
  DistributionType,
} from '@/lib/contract-utils'
import { getMinimumSalaryThreshold, LEAGUE_CAP } from '@/lib/league-cap'
import { TEAM_CAP_STATE, getTeamCapState } from '@/lib/team-cap-state'
import { getUsedExceptions } from '@/components/signing-exceptions-panel'
import {
  TradeAsset,
  TradeSideInput,
  ValidateTradeInput,
  validateTrade,
  getOwnedFirstRoundYears,
  parsePickIdMeta,
  TRADE_EVAL_SEASON,
  CURRENT_DRAFT_YEAR,
} from '@/lib/trade-validation'
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
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Trash2, CheckCircle2, Plus, X } from 'lucide-react'
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
  const {
    addSavedContract,
    updateSavedContract,
    addSavedTrade,
    setDeletedContractIds,
    selectedTeamAbbr,
    getTotalSalary,
    getTeamCapTotal,
    getEffectiveSalary,
    savedContracts,
    deletedContractIds,
    roster,
    draftPickPlayers,
    tradedRosterPlayerIds,
    tradedPickIds,
  } = useRoster()
  const [years, setYears] = useState('3')
  const [totalValue, setTotalValue] = useState('')
  const [distribution, setDistribution] = useState<DistributionType>('escalating')
  const [isMinimum, setIsMinimum] = useState(false)
  const [exceptionType, setExceptionType] = useState<ExceptionType | null>(null)
  const [isMaxContract, setIsMaxContract] = useState(false)
  const [isTwoWay, setIsTwoWay] = useState(false)
  const [isQualifyingOffer, setIsQualifyingOffer] = useState(false)
  const [isSignAndTrade, setIsSignAndTrade] = useState(false)
  const [selectedOutgoingRosterIds, setSelectedOutgoingRosterIds] = useState<Set<string>>(new Set())
  const [selectedOutgoingPickIds, setSelectedOutgoingPickIds] = useState<Set<string>>(new Set())
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
      setIsQualifyingOffer(editingContract.rfaPath === 'qualifying-offer')
      setIsSignAndTrade(false)
      setYearsError('')
    } else {
      setYears('3')
      setTotalValue('')
      setDistribution('escalating')
      setIsMinimum(false)
      setExceptionType(null)
      setIsMaxContract(false)
      setIsTwoWay(false)
      setIsQualifyingOffer(false)
      setIsSignAndTrade(false)
      setYearsError('')
    }
    setSelectedOutgoingRosterIds(new Set())
    setSelectedOutgoingPickIds(new Set())
  }, [isOpen, editingContract?.id, player, startingSeason])

  if (!player) return null

  // When editing an existing contract, anchor to that contract's own first funded season
  // rather than the season the cell that was clicked happens to belong to.
  const editingFirstSeason = editingContract
    ? SEASONS.find((s) => (editingContract.salary[s] ?? 0) > 0)
    : undefined
  const effectiveStartingSeason = (editingFirstSeason ?? startingSeason) as Season

  const isOnSelectedTeam = player.team === selectedTeamAbbr
  // Restricted-FA status is sourced data (RealGM's free-agent pool, or a
  // years-of-service heuristic for players still on a roster), not a user
  // choice — see isRestrictedFreeAgent.
  const isRestrictedFA = isRestrictedFreeAgent(player.name, effectiveStartingSeason)
  // An RFA signing with a different team than the player's own is an offer
  // sheet — min 2/max 4 years, no two-way. Tendering a QO only applies when
  // re-signing your own player.
  const isOfferSheet = isRestrictedFA && !isOnSelectedTeam && !isSignAndTrade

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

  // Sign-and-trade eligibility — the acquiring team (us) can't complete one
  // if it's already used the Taxpayer MLE this season, and the sending team
  // can't send a player out via sign-and-trade once it's over the second
  // apron. Both are hard CBA blocks, not just cap-space math.
  const taxpayerMleUsedForSeason = usedExceptions.has('taxpayer-mle')
  const sellerApronTotal = !isOnSelectedTeam ? getTeamCapTotal(player.team, effectiveStartingSeason).apronTotal : 0
  const sellerOverSecondApron = !isOnSelectedTeam && sellerApronTotal >= secondApron
  const signAndTradeBlocked = taxpayerMleUsedForSeason || sellerOverSecondApron
  const signAndTradeBlockReason = taxpayerMleUsedForSeason
    ? `${selectedTeamAbbr} already used its Taxpayer MLE this season`
    : sellerOverSecondApron
    ? `${player.team} is over the second apron`
    : null
  // The acquiring team is hard-capped at the first apron by a sign-and-trade
  // and can't complete one that would leave it above the first apron — but
  // whether it does depends on the outgoing trade pieces this modal doesn't
  // build, so this is a warning rather than a hard block.
  const signAndTradeApronWarning = isOverFirstApronBelowSecondApron || isOverSecondApron

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
    : isSignAndTrade
    ? Math.min(4, maxYears)
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
    !isSignAndTrade &&
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
      setIsSignAndTrade(false)
      setSelectedOutgoingRosterIds(new Set())
      setSelectedOutgoingPickIds(new Set())
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
      setIsSignAndTrade(false)
      setSelectedOutgoingRosterIds(new Set())
      setSelectedOutgoingPickIds(new Set())
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
      setIsSignAndTrade(false)
      setSelectedOutgoingRosterIds(new Set())
      setSelectedOutgoingPickIds(new Set())
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
      setIsSignAndTrade(false)
      setSelectedOutgoingRosterIds(new Set())
      setSelectedOutgoingPickIds(new Set())
      if (parseInt(years) > 2) setYears('2')
      setDistribution('flat')
    } else {
      setYears('3')
      setDistribution('escalating')
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
      setIsSignAndTrade(false)
      setSelectedOutgoingRosterIds(new Set())
      setSelectedOutgoingPickIds(new Set())
      setYears('1')
      setDistribution('flat')
    } else {
      setYears('3')
      setDistribution('escalating')
    }
  }

  const handleSignAndTradeToggle = (checked: boolean) => {
    setIsSignAndTrade(checked)
    setYearsError('')
    if (checked) {
      setIsMinimum(false)
      setExceptionType(null)
      setIsMaxContract(false)
      setIsTwoWay(false)
      setIsQualifyingOffer(false)
      setYears(String(Math.min(3, maxYears)))
      setDistribution('escalating')
    } else {
      setYears('3')
      setDistribution('escalating')
      setSelectedOutgoingRosterIds(new Set())
      setSelectedOutgoingPickIds(new Set())
    }
  }

  function toggleOutgoingRoster(id: string) {
    setSelectedOutgoingRosterIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleOutgoingPick(id: string) {
    setSelectedOutgoingPickIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getFirstYearSalary(p: { salary: Partial<Record<Season, number>> }) {
    for (const season of SEASONS) {
      if (p.salary[season]) return p.salary[season]!
    }
    return 0
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
    if (isSignAndTrade && numValue < 3) {
      setYearsError('Sign-and-trade contracts must run 3–4 years')
      setYears(String(Math.min(3, maxYears)))
      return
    }
    if (isSignAndTrade && numValue > 4) {
      setYearsError('Sign-and-trade contracts must run 3–4 years')
      setYears(String(Math.min(4, maxYears)))
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
    setIsQualifyingOffer(false)
    setIsSignAndTrade(false)
    setSelectedOutgoingRosterIds(new Set())
    setSelectedOutgoingPickIds(new Set())
    setYearsError('')
  }

  // Preserves the matched badge if editing a contract matchOfferSheet already
  // created; otherwise derives rfaPath from the data-sourced RFA status above.
  const rfaPath: SavedContract['rfaPath'] = !isRestrictedFA
    ? undefined
    : isQualifyingOffer
    ? 'qualifying-offer'
    : isOnSelectedTeam
    ? (editingContract?.rfaPath === 'matched-offer-sheet' ? 'matched-offer-sheet' : undefined)
    : 'offer-sheet'

  // Outgoing side of a sign-and-trade — the newly signed contract is the sole
  // incoming asset, so this only needs our own tradeable roster/picks, not
  // TradeModal's full available/incoming machinery.
  const availableOutgoingRoster = roster.filter(
    (p) => !tradedRosterPlayerIds.has(p.id) && !selectedOutgoingRosterIds.has(p.id)
  )
  const availableOutgoingPicks = draftPickPlayers.filter(
    (p) => !tradedPickIds.has(p.id) && !selectedOutgoingPickIds.has(p.id)
  )
  const selectedOutgoingRosterObjects = roster.filter((p) => selectedOutgoingRosterIds.has(p.id))
  const selectedOutgoingPickObjects = draftPickPlayers.filter((p) => selectedOutgoingPickIds.has(p.id))

  // Runs the same trade-rules validator TradeModal uses, so a sign-and-trade
  // can't silently fail to save (roster-context's addSavedTrade refuses an
  // invalid trade with only a console.warn) — surfacing the same
  // errors/warnings here before the user hits Save.
  const signAndTradeAnalysis = (() => {
    if (!isSignAndTrade || signAndTradeBlocked) return null

    const outgoingAssets: TradeAsset[] = [
      ...selectedOutgoingRosterObjects.map((p) => ({
        kind: 'player' as const,
        id: p.id,
        name: p.name,
        salaryBySeason: Object.fromEntries(
          SEASONS.map((s) => [s, getEffectiveSalary(p, s)] as const).filter(([, v]) => v > 0)
        ) as Partial<Record<Season, number>>,
      })),
      ...selectedOutgoingPickObjects.map((p) => {
        const { pickYear, pickRound } = parsePickIdMeta(p.id)
        return { kind: 'pick' as const, id: p.id, name: p.name, salaryBySeason: p.salary, pickYear, pickRound }
      }),
    ]
    const incomingAsset: TradeAsset = {
      kind: 'player',
      id: `st-${player.id}`,
      name: player.name,
      salaryBySeason: salaries,
    }

    const allAssets = [...outgoingAssets, incomingAsset]
    const seasonsFromEval = SEASONS.slice(SEASONS.indexOf(TRADE_EVAL_SEASON))
    const season: Season =
      seasonsFromEval.find((s) => allAssets.some((a) => (a.salaryBySeason[s] ?? 0) > 0)) ?? TRADE_EVAL_SEASON
    const thresholds = CAP_THRESHOLDS[season]

    const yourPreTradeTotal = getTotalSalary(season).capSpaceTotal
    const theirPreTradeTotal = getTeamCapTotal(player.team, season).capSpaceTotal
    const yourCapState = getTeamCapState(selectedTeamAbbr, TRADE_EVAL_SEASON)
    const theirCapState = getTeamCapState(player.team, TRADE_EVAL_SEASON)

    const yourSide: TradeSideInput = {
      side: 'yours',
      teamAbbr: selectedTeamAbbr,
      teamName: TEAM_NAMES[selectedTeamAbbr] || selectedTeamAbbr,
      preTradeTotal: yourPreTradeTotal,
      approximate: false,
      outgoing: outgoingAssets,
      incoming: [incomingAsset],
      heldTPEs: yourCapState?.heldTPEs ?? [],
      cashOut: 0,
      cashIn: 0,
      cashLedger: yourCapState?.cashLedger,
    }
    const theirSide: TradeSideInput = {
      side: 'theirs',
      teamAbbr: player.team,
      teamName: TEAM_NAMES[player.team] || player.team,
      preTradeTotal: theirPreTradeTotal,
      approximate: true,
      outgoing: [incomingAsset],
      incoming: outgoingAssets,
      heldTPEs: theirCapState?.heldTPEs ?? [],
      cashOut: 0,
      cashIn: 0,
      cashLedger: theirCapState?.cashLedger,
    }

    const validationInput: ValidateTradeInput = {
      season,
      thresholds,
      currentDraftYear: CURRENT_DRAFT_YEAR,
      sides: [yourSide, theirSide],
      ownedFirstRoundYearsByTeam: {
        [selectedTeamAbbr]: getOwnedFirstRoundYears(selectedTeamAbbr),
        [player.team]: getOwnedFirstRoundYears(player.team),
      },
    }

    return validateTrade(validationInput)
  })()

  const handleSave = () => {
    if (isSignAndTrade) {
      addSavedTrade({
        id: `trade-st-${player.id}-${Date.now()}`,
        tradeTeamAbbr: player.team,
        createdAt: new Date(),
        outgoingRosterPlayerIds: Array.from(selectedOutgoingRosterIds),
        outgoingPickIds: Array.from(selectedOutgoingPickIds),
        incomingPlayers: [{ playerId: `st-${player.id}-${Date.now()}`, playerName: player.name, salary: salaries, options: {} }],
        incomingPicks: [],
        isSignAndTrade: true,
      })
      resetForm()
      onClose()
      return
    }

    const type = isOnSelectedTeam ? 'extension' : 'free-agent'
    if (editingContract) {
      updateSavedContract({
        ...editingContract,
        type,
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
        type,
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

  // The label of the restricted contract type the user has actually selected,
  // once it satisfies the cap-imposed restriction below — used to swap the
  // restriction notice from a warning to a confirmation.
  const compliantContractLabel = isMinimum
    ? 'Minimum contract'
    : exceptionType === 'tmle' && tmleAvailable
    ? 'Taxpayer MLE contract'
    : exceptionType === 'ntmle' && ntmleAvailable
    ? 'Non-Taxpayer MLE contract'
    : exceptionType === 'bae' && baeAvailable
    ? 'Bi-Annual Exception contract'
    : null

  const isValid = isQualifyingOffer
    ? totalValueNum > 0 && numYears === 1
    : isSignAndTrade
    ? totalValueNum > 0 &&
      numYears >= 3 &&
      numYears <= 4 &&
      !signAndTradeBlocked &&
      (selectedOutgoingRosterIds.size > 0 || selectedOutgoingPickIds.size > 0) &&
      (signAndTradeAnalysis?.isValid ?? false)
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
            {!isSignAndTrade && isOverSecondApron && (
              compliantContractLabel ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {compliantContractLabel} is valid — team is over the second apron.
                </p>
              ) : (
                <p className="text-xs text-red-500">
                  Team is over the second apron. Only minimum contracts are available.
                </p>
              )
            )}
            {!isSignAndTrade && isOverFirstApronBelowSecondApron && (
              compliantContractLabel ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {compliantContractLabel} is valid — team is over the first apron.
                </p>
              ) : (
                <p className="text-xs text-red-500">
                  Team is over the first apron. {tmleAvailable ? 'Minimum or Taxpayer MLE contracts are available.' : 'The Taxpayer MLE has already been used — only a minimum contract is available.'}
                </p>
              )
            )}
            {!isSignAndTrade && isOverCapBelowFirstApron && (ntmleAvailable || baeAvailable) && (
              compliantContractLabel ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {compliantContractLabel} is valid — team is over the salary cap.
                </p>
              ) : (
                <p className="text-xs text-amber-500">
                  Team is over the salary cap. Minimum{ntmleAvailable ? ', Non-Taxpayer MLE' : ''}{baeAvailable ? ', or Bi-Annual Exception' : ''} contracts are available.
                </p>
              )
            )}
            {!isSignAndTrade && isOverCapBelowFirstApron && !ntmleAvailable && !baeAvailable && (
              compliantContractLabel ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {compliantContractLabel} is valid — team is over the salary cap.
                </p>
              ) : (
                <p className="text-xs text-amber-500">
                  Team is over the salary cap and has already used its Mid-Level and Bi-Annual Exceptions for {effectiveStartingSeason}. Only a minimum contract is available.
                </p>
              )
            )}

            {/* Restricted free agency status, grouped with whatever it implies for this deal */}
            {isRestrictedFA && (
              <div className="flex items-start gap-3 flex-wrap p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <Badge variant="outline" className="text-amber-500 border-amber-500/30 shrink-0">
                  Restricted Free Agent
                </Badge>

                {isOnSelectedTeam && (
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

                {isOfferSheet && (
                  <p className="text-xs text-muted-foreground w-full">
                    Offer sheet — must run 2–4 years and can&apos;t be a two-way deal. {player.team} will have a chance to
                    match; if they do, {player.name} can&apos;t be traded without his consent for one year, and never to{' '}
                    {selectedTeamAbbr} even with it.
                  </p>
                )}

                {isQualifyingOffer && (
                  <p className="text-xs text-muted-foreground w-full">
                    A qualifying offer is a 1-year, fully guaranteed deal that gives {player.team} matching rights over
                    any offer sheet {player.name} signs elsewhere. Enter the QO amount manually.
                  </p>
                )}

                {isSignAndTrade && (
                  <p className="text-xs text-muted-foreground w-full">
                    His restricted status doesn&apos;t apply here — {player.team} re-signs him under their own Bird
                    rights, then trades him, so there&apos;s no offer sheet or matching period.
                  </p>
                )}
              </div>
            )}

            {/* Contract type toggles */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Maximum Contract — shown when cap allows non-minimum contracts */}
              {!isSignAndTrade && !isOverSecondApron && !isOverFirstApronBelowSecondApron && !(isOverCapBelowFirstApron) && rookieYear !== undefined && (
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

              {!isSignAndTrade && (
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
              )}

              {!isSignAndTrade && ntmleAvailable && (
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

              {!isSignAndTrade && tmleAvailable && (
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

              {!isSignAndTrade && baeAvailable && (
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

              {!isOfferSheet && !isSignAndTrade && (
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

              {!isOnSelectedTeam && !isQualifyingOffer && !editingContract && (
                signAndTradeBlocked ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 cursor-not-allowed">
                        <Label htmlFor="sign-and-trade-fa" className="text-xs font-medium text-muted-foreground cursor-not-allowed">
                          Sign-and-Trade
                        </Label>
                        <Switch
                          id="sign-and-trade-fa"
                          checked={isSignAndTrade}
                          aria-disabled="true"
                          className="cursor-not-allowed opacity-50 data-[state=unchecked]:bg-gray-400"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">{signAndTradeBlockReason}</TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="sign-and-trade-fa" className="text-xs font-medium cursor-pointer">
                      Sign-and-Trade
                    </Label>
                    <Switch
                      id="sign-and-trade-fa"
                      checked={isSignAndTrade}
                      onCheckedChange={handleSignAndTradeToggle}
                      className="data-[state=unchecked]:bg-gray-400"
                    />
                  </div>
                )
              )}
            </div>

            {isTwoWay && (
              <p className="text-xs text-muted-foreground">
                50% of the 0-YOS minimum, flat, 1–2 years. Excluded from Team Salary entirely and counts against the
                team&apos;s 3 two-way slots{yoe !== undefined && yoe > 4 ? ' — note: players with more than 4 YOS are not eligible for a two-way deal' : ''}.
              </p>
            )}

            {isSignAndTrade && (
              <>
                <p className="text-xs text-muted-foreground">
                  {player.name} re-signs with {player.team} under their Bird rights, then is immediately traded to{' '}
                  {selectedTeamAbbr}. Must run 3–4 years with the first year fully guaranteed, and hard-caps{' '}
                  {selectedTeamAbbr} at the first apron for the rest of the season. Select what {selectedTeamAbbr}{' '}
                  sends {player.team} below to complete the deal — this becomes a normal trade.
                </p>
                {signAndTradeApronWarning && (
                  <p className="text-xs text-amber-500">
                    {selectedTeamAbbr} is already over the first apron — the outgoing assets below need to bring them
                    back under it.
                  </p>
                )}

                <div className="rounded-md border border-border/60 overflow-hidden">
                  <div className="px-2.5 py-1.5 bg-muted/40 border-b border-border/60">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {selectedTeamAbbr} sends to {player.team}
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto p-1.5 space-y-0.5">
                    {selectedOutgoingRosterObjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleOutgoingRoster(p.id)}
                        className="w-full flex items-center justify-between px-1.5 py-1 rounded text-xs bg-primary/10 hover:bg-primary/15 transition-colors"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="flex items-center gap-1 text-muted-foreground shrink-0 ml-1.5">
                          <span className="font-mono tabular-nums">{formatCurrency(getFirstYearSalary(p))}</span>
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                    {selectedOutgoingPickObjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleOutgoingPick(p.id)}
                        className="w-full flex items-center justify-between px-1.5 py-1 rounded text-xs bg-primary/10 hover:bg-primary/15 transition-colors"
                      >
                        <span className="truncate">{p.name}</span>
                        <X className="h-3 w-3 text-muted-foreground shrink-0 ml-1.5" />
                      </button>
                    ))}
                    {availableOutgoingRoster.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleOutgoingRoster(p.id)}
                        className="w-full flex items-center justify-between px-1.5 py-1 rounded text-xs hover:bg-muted/60 transition-colors"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="flex items-center gap-1 text-muted-foreground shrink-0 ml-1.5">
                          <span className="font-mono tabular-nums">{formatCurrency(getFirstYearSalary(p))}</span>
                          <Plus className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                    {availableOutgoingPicks.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleOutgoingPick(p.id)}
                        className="w-full flex items-center justify-between px-1.5 py-1 rounded text-xs hover:bg-muted/60 transition-colors"
                      >
                        <span className="truncate">{p.name}</span>
                        <Plus className="h-3 w-3 text-muted-foreground shrink-0 ml-1.5" />
                      </button>
                    ))}
                    {availableOutgoingRoster.length === 0 &&
                      availableOutgoingPicks.length === 0 &&
                      selectedOutgoingRosterObjects.length === 0 &&
                      selectedOutgoingPickObjects.length === 0 && (
                        <p className="text-xs text-muted-foreground px-1.5 py-1">No available assets</p>
                      )}
                  </div>
                </div>

                {signAndTradeAnalysis && signAndTradeAnalysis.errors.length > 0 && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 space-y-1">
                    <p className="text-xs font-semibold text-destructive">Trade Invalid</p>
                    {signAndTradeAnalysis.errors.map((e, i) => (
                      <p key={i} className="text-xs text-destructive-foreground/90">{e.message}</p>
                    ))}
                  </div>
                )}
                {signAndTradeAnalysis && signAndTradeAnalysis.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-1">
                    <p className="text-xs font-semibold text-amber-500">Heads up</p>
                    {signAndTradeAnalysis.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-foreground/90">{w.message}</p>
                    ))}
                  </div>
                )}
              </>
            )}

            {exceptionType && (
              <p className="text-xs text-muted-foreground">
                {EXCEPTION_LABELS[exceptionType]}: up to {EXCEPTION_MAX_YEARS[exceptionType]} years, 5% annual raises
                {exceptionType === 'tmle' ? ' — signings only, and it hard-caps the team at the second apron for the rest of the year' : ''}.
              </p>
            )}

            {/* Max contract info line */}
            {(isSignAndTrade || (!isOverSecondApron && !isOverFirstApronBelowSecondApron && !isOverCapBelowFirstApron)) && yoe !== undefined && maxPct !== undefined && (
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
                min={isSignAndTrade ? 3 : isOfferSheet ? 2 : 1}
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
              <p className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Contract Preview
              </p>
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
            {editingContract ? 'Save Changes' : isSignAndTrade ? 'Save Trade' : 'Save Contract'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
