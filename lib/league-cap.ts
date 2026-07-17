import { Season } from './types'

export interface LeagueCapYear {
  /** true once published in the NBA/NBPA cap memo; false = projection */
  official: boolean

  // top-line (mirrors CAP_THRESHOLDS in data.ts, as scalars the engine can read directly)
  softCap: number
  luxuryTax: number
  firstApron: number
  secondApron: number
  salaryFloor: number

  // salary-matching brackets (2023 CBA "Expanded TPE" bands)
  matching: {
    lowerCeiling: number   // below this, maxIn = 2*out + cushion
    upperFloor: number     // above this, maxIn = 1.25*out
    middleCushion: number  // between them, maxIn = out + cushion
    flatCushion: number    // the +$ cushion in the low bracket (flat — not scaled by season)
  }

  /**
   * Minimum-salary scale by years of service (0 = rookie). Real per-YOS figures
   * haven't been sourced yet — every bucket currently carries the same flat
   * value trade-validation.ts already used pre-refactor, so isMinimumSalary's
   * classification is unchanged until real per-YOS numbers replace these.
   */
  minimumByYos: Record<number, number>

  // exception amounts (for future hard-cap / signing logic — not yet read by the validator).
  // Scaled from a single unverified 2026-27 estimate; spot-check before relying on these.
  exceptions: {
    nonTaxpayerMLE: number
    taxpayerMLE: number
    roomMLE: number
    biAnnual: number
  }

  // 5.15%-of-cap cash-in-trade limit (not yet read by the validator — see team-cap-state.ts ledger)
  cashInTradeLimit: number
}

// minimumByYos is intentionally flat (same figure for every YOS bucket) until a
// real per-year-of-service minimum salary scale is sourced and entered here.
function flatMinimumScale(value: number): Record<number, number> {
  const scale: Record<number, number> = {}
  for (let yos = 0; yos <= 10; yos++) scale[yos] = value
  return scale
}

export const LEAGUE_CAP: Record<Season, LeagueCapYear> = {
  '2026-27': {
    official: true,
    softCap: 164961000, luxuryTax: 200428000, firstApron: 209015000,
    secondApron: 221686000, salaryFloor: 148465000,
    matching: { lowerCeiling: 7250000, upperFloor: 29000000, middleCushion: 8527000, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1320000),
    exceptions: { nonTaxpayerMLE: 14100000, taxpayerMLE: 5700000, roomMLE: 8800000, biAnnual: 5000000 },
    cashInTradeLimit: 8495000,
  },
  '2027-28': {
    official: false,
    softCap: 174034000, luxuryTax: 211452000, firstApron: 220511000,
    secondApron: 233879000, salaryFloor: 156631000,
    matching: { lowerCeiling: 7648756, upperFloor: 30595025, middleCushion: 8995992, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1392601),
    exceptions: { nonTaxpayerMLE: 14875512, taxpayerMLE: 6013505, roomMLE: 9284008, biAnnual: 5275004 },
    cashInTradeLimit: 8962232,
  },
  '2028-29': {
    official: false,
    softCap: 183606000, luxuryTax: 223082000, firstApron: 232639000,
    secondApron: 246742000, salaryFloor: 165246000,
    matching: { lowerCeiling: 8069444, upperFloor: 32277775, middleCushion: 9490779, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1469195),
    exceptions: { nonTaxpayerMLE: 15693677, taxpayerMLE: 6344252, roomMLE: 9794635, biAnnual: 5565134 },
    cashInTradeLimit: 9455162,
  },
  '2029-30': {
    official: false,
    softCap: 193704000, luxuryTax: 235352000, firstApron: 245434000,
    secondApron: 260313000, salaryFloor: 174335000,
    matching: { lowerCeiling: 8513249, upperFloor: 34052994, middleCushion: 10012755, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1549998),
    exceptions: { nonTaxpayerMLE: 16556801, taxpayerMLE: 6693175, roomMLE: 10333322, biAnnual: 5871206 },
    cashInTradeLimit: 9975179,
  },
  '2030-31': {
    official: false,
    softCap: 204358000, luxuryTax: 248296000, firstApron: 258933000,
    secondApron: 274630000, salaryFloor: 183923000,
    matching: { lowerCeiling: 8981490, upperFloor: 35925958, middleCushion: 10563471, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1635251),
    exceptions: { nonTaxpayerMLE: 17467449, taxpayerMLE: 7061309, roomMLE: 10901670, biAnnual: 6194131 },
    cashInTradeLimit: 10523828,
  },
  '2031-32': {
    official: false,
    softCap: 215598000, luxuryTax: 261952000, firstApron: 273174000,
    secondApron: 289735000, salaryFloor: 194039000,
    matching: { lowerCeiling: 9475485, upperFloor: 37901940, middleCushion: 11144477, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1725192),
    exceptions: { nonTaxpayerMLE: 18428185, taxpayerMLE: 7449692, roomMLE: 11501278, biAnnual: 6534817 },
    cashInTradeLimit: 11102655,
  },
  '2032-33': {
    official: false,
    softCap: 227456000, luxuryTax: 276359000, firstApron: 288199000,
    secondApron: 305670000, salaryFloor: 204711000,
    matching: { lowerCeiling: 9996642, upperFloor: 39986567, middleCushion: 11757429, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1820078),
    exceptions: { nonTaxpayerMLE: 19441744, taxpayerMLE: 7859429, roomMLE: 12133855, biAnnual: 6894236 },
    cashInTradeLimit: 11713306,
  },
  '2033-34': {
    official: false,
    softCap: 239966000, luxuryTax: 291559000, firstApron: 304050000,
    secondApron: 322482000, salaryFloor: 215970000,
    matching: { lowerCeiling: 10546453, upperFloor: 42185814, middleCushion: 12404084, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(1920182),
    exceptions: { nonTaxpayerMLE: 20511034, taxpayerMLE: 8291694, roomMLE: 12801212, biAnnual: 7273416 },
    cashInTradeLimit: 12357534,
  },
  '2034-35': {
    official: false,
    softCap: 253164000, luxuryTax: 307595000, firstApron: 320773000,
    secondApron: 340219000, salaryFloor: 227848000,
    matching: { lowerCeiling: 11126503, upperFloor: 44506011, middleCushion: 13086302, flatCushion: 250000 },
    minimumByYos: flatMinimumScale(2025791),
    exceptions: { nonTaxpayerMLE: 21639129, taxpayerMLE: 8747733, roomMLE: 13505272, biAnnual: 7673450 },
    cashInTradeLimit: 13037192,
  },
}

// Best-effort lookup for a player's minimum-salary threshold by years of service.
// Falls back to the rookie (YOS 0) figure when YOS is unknown, and to the
// highest known bucket when YOS exceeds what's modeled.
export function getMinimumSalaryThreshold(season: Season, yearsOfService?: number): number {
  const table = LEAGUE_CAP[season].minimumByYos
  const yos = yearsOfService ?? 0
  const maxYos = Math.max(...Object.keys(table).map(Number))
  return table[Math.min(yos, maxYos)] ?? table[0]
}
