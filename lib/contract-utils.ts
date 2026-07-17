import { Season } from './types'
import { CAP_THRESHOLDS } from './data'
import { PLAYER_ROOKIE_YEARS } from './rookie-years'
import { nameLookup } from './player-key'

export type DistributionType = 'flat' | 'escalating' | 'declining'

const rookieYearOf = nameLookup(PLAYER_ROOKIE_YEARS)

export function getPlayerRookieYear(playerName: string): number | undefined {
  return rookieYearOf(playerName)
}

export function getPlayerYOE(rookieYear: number, startSeason: Season): number {
  const startYear = parseInt(startSeason.split('-')[0])
  return startYear - rookieYear
}

export function getMaxContractPct(yoe: number): number {
  if (yoe <= 6) return 0.25
  if (yoe <= 9) return 0.30
  return 0.35
}

function getSoftCap(season: Season): number {
  return CAP_THRESHOLDS[season]?.find((t) => t.type === 'soft-cap')?.value ?? 150000000
}

// Computes per-season salaries for a max contract.
// Escalating: each year = maxPct * that season's cap
// Flat: each year = maxPct * first season's cap (salary stays constant)
// Declining: each year = maxPct * first season's cap, then -5% per year
export function getMaxContractSalaries(
  rookieYear: number,
  startSeason: Season,
  contractSeasons: Season[],
  distribution: DistributionType
): Partial<Record<Season, number>> {
  const yoe = getPlayerYOE(rookieYear, startSeason)
  const maxPct = getMaxContractPct(yoe)
  const firstYearSalary = maxPct * getSoftCap(startSeason)

  const result: Partial<Record<Season, number>> = {}
  contractSeasons.forEach((season, i) => {
    if (distribution === 'escalating') {
      result[season] = maxPct * getSoftCap(season)
    } else if (distribution === 'flat') {
      result[season] = firstYearSalary
    } else {
      result[season] = firstYearSalary * Math.pow(0.95, i)
    }
  })
  return result
}

// The max total value (in dollars) a user is allowed to enter for a given
// distribution, seasons, and player — based on the first-year salary cap rule.
// Escalating: sum of (maxPct * cap) for each year
// Flat: maxPct * cap(firstSeason) * numYears
// Declining: maxPct * cap(firstSeason) * Σ(0.95^i)
export function getMaxAllowedTotal(
  rookieYear: number,
  startSeason: Season,
  contractSeasons: Season[],
  distribution: DistributionType
): number {
  const salaries = getMaxContractSalaries(rookieYear, startSeason, contractSeasons, distribution)
  return Object.values(salaries).reduce((a, b) => a + (b ?? 0), 0)
}
