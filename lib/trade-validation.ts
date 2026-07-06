import { Season, CapThreshold } from './types'
import { CAP_THRESHOLDS, formatCurrency } from './data'
import { getPicksByTeamAbbr, DraftPick } from './draft-picks'

export type TradeTeamSide = 'yours' | 'theirs'
export type TradeSeverity = 'error' | 'warning'

export interface TradeAsset {
  kind: 'player' | 'pick'
  id: string
  name: string
  salaryBySeason: Partial<Record<Season, number>>
  isMinimum?: boolean
  pickYear?: number
  pickRound?: 1 | 2
}

export interface TradeSideInput {
  side: TradeTeamSide
  teamAbbr: string
  teamName: string
  preTradeTotal: number
  approximate: boolean
  outgoing: TradeAsset[]
  incoming: TradeAsset[]
}

export interface ValidateTradeInput {
  season: Season
  thresholds: CapThreshold[]
  currentDraftYear: number
  sides: [TradeSideInput, TradeSideInput]
  ownedFirstRoundYearsByTeam: Record<string, number[]>
}

export interface TradeViolation {
  code: string
  severity: TradeSeverity
  side: TradeTeamSide
  message: string
  assetNames?: string[]
  whyUncertain?: string
  neededInfo?: string
}

export interface TradeValidationResult {
  errors: TradeViolation[]
  warnings: TradeViolation[]
  isValid: boolean
}

// Season trades are evaluated against — the upcoming league year, since
// 2025-26 has already been played out. Also the default used before a trade
// has any assets in it.
export const TRADE_EVAL_SEASON: Season = '2026-27'

// The 2026 draft has already happened (real pick numbers are in the data);
// 2027+ are the "future" drafts this app lets you deal. Used for the
// seven-year trade window and the Stepien-rule horizon.
export const CURRENT_DRAFT_YEAR = 2026

// Recovers a pick's draft year/round from the app's `draft-{year}-{round}-...`
// id convention (see lib/draft-picks.ts / roster-context.tsx), so trade
// assets built from those ids can be checked against the seven-year window
// and Stepien rule without re-threading the year/round through every caller.
export function parsePickIdMeta(id: string): { pickYear?: number; pickRound?: 1 | 2 } {
  const yearMatch = id.match(/draft-(\d+)-/)
  const pickYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined
  const pickRound: 1 | 2 | undefined = /first[- ]round/i.test(id) ? 1 : /second[- ]round/i.test(id) ? 2 : undefined
  return { pickYear, pickRound }
}

// A trade that breaks a rule for the partner team is just as invalid as one
// that breaks it for yours, so this hard-errors both sides equally (partner
// numbers now include their saved contracts/trades, not just a bare roster
// guess). Flip to true to go back to downgrading partner-side findings to
// non-blocking warnings.
export const PARTNER_FINDINGS_ARE_WARNINGS = false

const BASE_SEASON: Season = TRADE_EVAL_SEASON

// 2026-27 baseline figures for the salary-matching brackets below. These are
// approximations of the 2023 CBA rules (not a live trade machine), scaled by
// this app's own soft-cap growth (see scaleFactor) for other seasons so the
// validator stays internally consistent with what the roster table shows.
// Verify against a current source before relying on these for a real trade.
const BASE_MATCH_CUSHION = 250_000 // flat $ cushion, not scaled — removed above the first apron
const BASE_LOWER_CEILING = 7_250_000
const BASE_UPPER_FLOOR = 29_000_000
const BASE_MIDDLE_CUSHION = 8_527_000
const BASE_MINIMUM_SALARY = 1_320_000

export const FIDELITY_NOTE =
  "Not checked: Bird rights, non-guaranteed salary, trade bonuses/kickers, base-year compensation & poison-pill contracts, sign-and-trades, cash in trades, pick protections/swaps, the moratorium & trade-deadline timing, the two-month re-aggregation rule, and the touch rule (this tool only builds two-team trades). Cap and apron figures are approximations for planning, not a substitute for a live trade machine. The partner team's salary includes their roster, saved contracts, and saved trades in this app — trades built from another team's perspective aren't visible here."

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function getThreshold(thresholds: CapThreshold[], type: CapThreshold['type']): number {
  return thresholds.find((t) => t.type === type)?.value ?? 0
}

function scaleFactor(thresholds: CapThreshold[]): number {
  const baseSoftCap = getThreshold(CAP_THRESHOLDS[BASE_SEASON] ?? [], 'soft-cap') || 1
  const softCap = getThreshold(thresholds, 'soft-cap') || baseSoftCap
  return softCap / baseSoftCap
}

function joinNames(names: string[]): string {
  if (names.length === 0) return 'nothing'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function severityFor(side: TradeSideInput): TradeSeverity {
  return side.approximate && PARTNER_FINDINGS_ARE_WARNINGS ? 'warning' : 'error'
}

function isMinimumSalary(salary: number, thresholds: CapThreshold[]): boolean {
  return salary > 0 && salary <= BASE_MINIMUM_SALARY * scaleFactor(thresholds)
}

function playerAssets(assets: TradeAsset[]): TradeAsset[] {
  return assets.filter((a) => a.kind === 'player')
}

function pickAssets(assets: TradeAsset[]): TradeAsset[] {
  return assets.filter((a) => a.kind === 'pick')
}

function salaryOf(asset: TradeAsset, season: Season): number {
  return asset.salaryBySeason[season] ?? 0
}

function describeDraftPick(pick: DraftPick): string {
  const roundLabel = pick.round === 'First Round' ? 'first-round pick' : 'second-round pick'
  const source = pick.teamFrom ? ` from ${pick.teamFrom}` : ''
  return `${pick.year} ${roundLabel}${source}`
}

function firstRoundPickYears(assets: TradeAsset[]): number[] {
  return assets
    .filter((a): a is TradeAsset & { pickYear: number } => a.kind === 'pick' && a.pickRound === 1 && a.pickYear !== undefined)
    .map((a) => a.pickYear)
}

// ---------------------------------------------------------------------------
// salary totals — picks and cash always contribute $0. Best-effort: an
// incoming player flagged (or inferred, via the season's minimum) as a
// minimum-salary player counts as $0 incoming for matching purposes.
//
// Note: this reuses the same (minimum-zeroed) inTotal for both bracket
// matching AND the post-trade total / tier classification below, so the
// validator and the "after this trade" preview never disagree. Real team
// salary would still include a minimum player's actual cap hit — this is a
// deliberate simplification of the matching-exception mechanics, not a cap
// bug; see the Fidelity note.
// ---------------------------------------------------------------------------

interface SideTotals {
  outTotal: number
  inTotal: number
}

function computeSideTotals(side: TradeSideInput, season: Season, thresholds: CapThreshold[]): SideTotals {
  const outPlayers = playerAssets(side.outgoing)
  const inPlayers = playerAssets(side.incoming)
  const outTotal = outPlayers.reduce((sum, a) => sum + salaryOf(a, season), 0)
  const inTotal = inPlayers.reduce((sum, a) => {
    const salary = salaryOf(a, season)
    const treatAsMinimum = a.isMinimum ?? isMinimumSalary(salary, thresholds)
    return sum + (treatAsMinimum ? 0 : salary)
  }, 0)
  return { outTotal, inTotal }
}

export function getPostTradeTotal(side: TradeSideInput, season: Season, thresholds: CapThreshold[]): number {
  const { outTotal, inTotal } = computeSideTotals(side, season, thresholds)
  return side.preTradeTotal - outTotal + inTotal
}

export function getOwnedFirstRoundYears(teamAbbr: string): number[] {
  return getPicksByTeamAbbr(teamAbbr)
    .filter((p) => p.round === 'First Round')
    .map((p) => p.year)
}

type MatchTier = 'below-cap' | 'expanded' | 'first-apron' | 'second-apron'

function getMatchTier(total: number, thresholds: CapThreshold[]): MatchTier {
  const softCap = getThreshold(thresholds, 'soft-cap')
  const firstApron = getThreshold(thresholds, 'first-apron')
  const secondApron = getThreshold(thresholds, 'second-apron')
  if (total >= secondApron) return 'second-apron'
  if (total >= firstApron) return 'first-apron'
  if (total >= softCap) return 'expanded'
  return 'below-cap'
}

// ---------------------------------------------------------------------------
// Rule 1 (salary matching) + Rule 3 (first-apron over-send) — these share the
// same postTradeTotal/tier math, so they're computed together to avoid
// reporting the same dollar-for-dollar violation twice under one code and
// then again under another.
// ---------------------------------------------------------------------------

function checkSalaryMatching(side: TradeSideInput, input: ValidateTradeInput): TradeViolation[] {
  const { season, thresholds } = input
  const { outTotal, inTotal } = computeSideTotals(side, season, thresholds)
  const postTradeTotal = side.preTradeTotal - outTotal + inTotal
  const tier = getMatchTier(postTradeTotal, thresholds)
  if (tier === 'below-cap') return []

  const factor = scaleFactor(thresholds)
  let maxIncoming: number

  if (tier === 'expanded') {
    const lowerCeiling = BASE_LOWER_CEILING * factor
    const upperFloor = BASE_UPPER_FLOOR * factor
    const middleCushion = BASE_MIDDLE_CUSHION * factor
    if (outTotal < lowerCeiling) {
      maxIncoming = 2 * outTotal + BASE_MATCH_CUSHION
    } else if (outTotal <= upperFloor) {
      maxIncoming = outTotal + middleCushion
    } else {
      maxIncoming = 1.25 * outTotal
    }
  } else {
    maxIncoming = outTotal
  }

  if (inTotal <= maxIncoming) return []

  const outNames = playerAssets(side.outgoing).map((a) => a.name)
  const inNames = playerAssets(side.incoming).map((a) => a.name)
  const severity = severityFor(side)
  const assetNames = [...outNames, ...inNames]

  if (tier === 'expanded') {
    return [
      {
        code: 'SALARY_MATCH',
        severity,
        side: side.side,
        assetNames,
        message: `${side.teamName} takes back ${joinNames(inNames)} (${formatCurrency(inTotal)}) but only sends out ${joinNames(outNames)} (${formatCurrency(outTotal)}). As an over-the-cap team, ${side.teamName} can absorb at most ${formatCurrency(maxIncoming)} in this trade. Trim ${formatCurrency(inTotal - maxIncoming)} of incoming salary or send out more.`,
      },
    ]
  }

  // tier is 'first-apron' or 'second-apron' — no Expanded TPE above the first apron.
  const preTradeTier = getMatchTier(side.preTradeTotal, thresholds)
  const firstApron = getThreshold(thresholds, 'first-apron')
  const wasBelowFirstApron = preTradeTier === 'below-cap' || preTradeTier === 'expanded'

  if (wasBelowFirstApron) {
    return [
      {
        code: 'FIRST_APRON_OVERSEND',
        severity,
        side: side.side,
        assetNames,
        message: `This trade would push ${side.teamName} from ${formatCurrency(side.preTradeTotal)} to ${formatCurrency(postTradeTotal)}, over the first apron (${formatCurrency(firstApron)}) — but taking back more salary than you send (${formatCurrency(inTotal)} in for ${formatCurrency(outTotal)} out) hard-caps a team AT the first apron, so it can't cross it in the same deal. Trim ${formatCurrency(postTradeTotal - firstApron)} of incoming salary.`,
      },
    ]
  }

  return [
    {
      code: 'FIRST_APRON_OVERSEND',
      severity,
      side: side.side,
      assetNames,
      message: `${side.teamName} is over the first apron and can't take back more salary than it sends. Sending ${joinNames(outNames)} (${formatCurrency(outTotal)}) but receiving ${joinNames(inNames)} (${formatCurrency(inTotal)}). Trim ${formatCurrency(inTotal - outTotal)}.`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Rule 2 — aggregation ban (second apron)
// ---------------------------------------------------------------------------

function checkAggregation(side: TradeSideInput, input: ValidateTradeInput): TradeViolation[] {
  const { season, thresholds } = input
  const { outTotal, inTotal } = computeSideTotals(side, season, thresholds)
  const postTradeTotal = side.preTradeTotal - outTotal + inTotal
  if (getMatchTier(postTradeTotal, thresholds) !== 'second-apron') return []

  const outPlayers = playerAssets(side.outgoing)
  if (outPlayers.length < 2) return []

  const names = outPlayers.map((a) => a.name)
  return [
    {
      code: 'AGGREGATION_BAN',
      severity: severityFor(side),
      side: side.side,
      assetNames: names,
      message: `${side.teamName} is over the second apron and cannot combine ${joinNames(names)} in one trade. Each incoming player must be matched by a single outgoing player of equal or greater salary.`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Rule 4 — hard-cap consequences (informational, always a warning)
// ---------------------------------------------------------------------------

function checkHardCapWarnings(side: TradeSideInput, input: ValidateTradeInput): TradeViolation[] {
  const { season, thresholds } = input
  const { outTotal, inTotal } = computeSideTotals(side, season, thresholds)
  const postTradeTotal = side.preTradeTotal - outTotal + inTotal
  const tier = getMatchTier(postTradeTotal, thresholds)
  const violations: TradeViolation[] = []

  if (tier === 'expanded' && inTotal > outTotal) {
    violations.push({
      code: 'HARD_CAP_EXPANDED',
      severity: 'warning',
      side: side.side,
      message: `Taking back more than you send uses the Expanded exception and hard-caps ${side.teamName} at the first apron for the rest of the league year.`,
    })
  }

  const outPlayers = playerAssets(side.outgoing)
  if (tier !== 'second-apron' && outPlayers.length >= 2) {
    violations.push({
      code: 'HARD_CAP_AGGREGATION',
      severity: 'warning',
      side: side.side,
      message: `Aggregating salaries hard-caps ${side.teamName} at the second apron for the rest of the league year.`,
    })
  }

  return violations
}

// ---------------------------------------------------------------------------
// Rule 5a — seven-year window
// ---------------------------------------------------------------------------

function checkSevenYearWindow(side: TradeSideInput, input: ValidateTradeInput): TradeViolation[] {
  const limit = input.currentDraftYear + 7
  const severity = severityFor(side)
  return pickAssets(side.outgoing)
    .filter((p) => (p.pickYear ?? 0) > limit)
    .map((p) => ({
      code: 'SEVEN_YEAR_WINDOW',
      severity,
      side: side.side,
      assetNames: [p.name],
      message: `${p.name} is too far out to trade. Picks can only be dealt up to seven drafts ahead (through ${limit} right now).`,
    }))
}

// ---------------------------------------------------------------------------
// Rule 5b — Stepien rule (no consecutive missing firsts). Conservative: the
// app doesn't model pick protections/swaps, so a clear unconditional gap is
// an error, but if a pick relevant to the gap carries protection/swap data
// this is downgraded to a warning that names the specific pick.
// ---------------------------------------------------------------------------

function checkStepien(side: TradeSideInput, input: ValidateTradeInput): TradeViolation[] {
  const outgoingFirstYears = firstRoundPickYears(side.outgoing)
  if (outgoingFirstYears.length === 0) return []

  const baseYears = new Set(input.ownedFirstRoundYearsByTeam[side.teamAbbr] ?? [])
  const projected = new Set(baseYears)
  outgoingFirstYears.forEach((y) => projected.delete(y))
  firstRoundPickYears(side.incoming).forEach((y) => projected.add(y))

  const horizonStart = input.currentDraftYear + 1
  const horizonEnd = input.currentDraftYear + 7

  let gapPair: [number, number] | null = null
  for (let y = horizonStart; y < horizonEnd; y++) {
    if (!projected.has(y) && !projected.has(y + 1)) {
      gapPair = [y, y + 1]
      break
    }
  }

  const outgoingPickNames = pickAssets(side.outgoing)
    .filter((p) => p.pickRound === 1)
    .map((p) => p.name)
  const conditionalFirsts = getPicksByTeamAbbr(side.teamAbbr).filter(
    (p) => p.round === 'First Round' && (p.protections || p.swapOption)
  )

  if (gapPair) {
    const [yearA, yearB] = gapPair
    const relevant = conditionalFirsts.find((p) => p.year === yearA || p.year === yearB)

    if (relevant) {
      const conditionText = relevant.protections
        ? `protections (${relevant.protections})`
        : `a swap condition (${relevant.swapOption})`
      return [
        {
          code: 'STEPIEN_RULE',
          severity: 'warning',
          side: side.side,
          assetNames: outgoingPickNames,
          message: `This trade could leave ${side.teamName} without a first-round pick in both ${yearA} and ${yearB}. Trading ${joinNames(outgoingPickNames)} contributes to the gap, but it depends on the ${describeDraftPick(relevant)}, which carries ${conditionText} this tool doesn't evaluate.`,
          whyUncertain: `The ${describeDraftPick(relevant)} carries ${conditionText} this tool doesn't evaluate, so it may not convey to ${side.teamName} in time to close the ${yearA}/${yearB} gap.`,
          neededInfo: `Whether the ${relevant.year} pick conveys to ${side.teamName} despite its ${relevant.protections ? 'protections' : 'swap condition'} — if it does, ${side.teamName} has a first in ${relevant.year} and no gap exists.`,
        },
      ]
    }

    return [
      {
        code: 'STEPIEN_RULE',
        severity: severityFor(side),
        side: side.side,
        assetNames: outgoingPickNames,
        message: `This trade would leave ${side.teamName} without a first-round pick in both ${yearA} and ${yearB}. Trading ${joinNames(outgoingPickNames)} breaks the Stepien rule (no two straight drafts without a first).`,
      },
    ]
  }

  // No clean gap — but if a year the team is "counting on" for its first is
  // itself conditional, and losing it would open a gap, flag the risk.
  for (const year of Array.from(projected).sort((a, b) => a - b)) {
    if (year < horizonStart || year > horizonEnd) continue
    const relevant = conditionalFirsts.find((p) => p.year === year)
    if (!relevant) continue
    const prevMissing = !projected.has(year - 1)
    const nextMissing = !projected.has(year + 1)
    if (!prevMissing && !nextMissing) continue
    const adjacentYear = prevMissing ? year - 1 : year + 1
    const [yearA, yearB] = [Math.min(year, adjacentYear), Math.max(year, adjacentYear)]
    const conditionText = relevant.protections
      ? `protections (${relevant.protections})`
      : `a swap condition (${relevant.swapOption})`
    return [
      {
        code: 'STEPIEN_RULE',
        severity: 'warning',
        side: side.side,
        assetNames: outgoingPickNames,
        message: `${describeDraftPick(relevant)} is what keeps ${side.teamName} from a Stepien gap in ${yearA}/${yearB}, but it carries ${conditionText} this tool doesn't evaluate.`,
        whyUncertain: `${describeDraftPick(relevant)} carries ${conditionText}, so it may not convey to ${side.teamName} in ${year}.`,
        neededInfo: `Whether the ${relevant.year} pick conveys to ${side.teamName} despite its ${relevant.protections ? 'protections' : 'swap condition'} — if it does, ${side.teamName} has a first in ${year} and no gap exists.`,
      },
    ]
  }

  return []
}

// ---------------------------------------------------------------------------
// Rule 6 — roster-spot reminder (informational, always a warning)
// ---------------------------------------------------------------------------

function checkRosterSpots(side: TradeSideInput): TradeViolation[] {
  const inPlayers = playerAssets(side.incoming)
  const outPlayers = playerAssets(side.outgoing)
  const n = inPlayers.length - outPlayers.length
  if (n <= 0) return []

  const names = inPlayers.map((p) => p.name)
  return [
    {
      code: 'ROSTER_SPOTS',
      severity: 'warning',
      side: side.side,
      assetNames: names,
      message: `${side.teamName} is acquiring ${n} more player${n !== 1 ? 's' : ''} (${joinNames(names)}) than it sends out and will need ${n} open roster spot${n !== 1 ? 's' : ''} before this trade can be processed.`,
    },
  ]
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export function validateTrade(input: ValidateTradeInput): TradeValidationResult {
  const errors: TradeViolation[] = []
  const warnings: TradeViolation[] = []

  const collect = (violations: TradeViolation[]) => {
    for (const v of violations) {
      if (v.severity === 'error') errors.push(v)
      else warnings.push(v)
    }
  }

  for (const side of input.sides) {
    collect(checkSalaryMatching(side, input))
    collect(checkAggregation(side, input))
    collect(checkHardCapWarnings(side, input))
    collect(checkSevenYearWindow(side, input))
    collect(checkStepien(side, input))
    collect(checkRosterSpots(side))
  }

  return { errors, warnings, isValid: errors.length === 0 }
}
