import { Season } from './types'
import { nameLookup } from './player-key'

export interface ContractDetail {
  /** % of remaining salary, accelerated into the acquiring team's incoming figure */
  tradeBonusPct?: number
  /** likely/unlikely incentives per season (best public estimate; label as such) */
  incentives?: Partial<Record<Season, { likely: number; unlikely: number }>>
  /** exception the deal was signed under — drives the "$0 incoming min" + hard-cap logic */
  signedUnder?: 'minimum' | 'rookie-scale' | 'bird' | 'early-bird' | 'non-bird'
    | 'non-taxpayer-mle' | 'taxpayer-mle' | 'room-mle' | 'bi-annual' | 'cap-room' | 'max'
  /** rare — a handful league-wide. Eligibility (8 yrs svc + 4 w/ team) is derivable; possession isn't */
  noTradeClause?: boolean
  /** last season's actual salary — needed for Base-Year Comp + the >120% re-sign lock */
  priorSeasonSalary?: number
  /** on a signed-but-not-yet-in-effect rookie-scale extension — special BYC-style figures */
  poisonPill?: { outgoingValue: number; incomingValue: number }
}

// Sparse and empty by design — no contract-level detail has been sourced yet.
// Keyed by raw display name (same convention as rookie-years.ts); read through
// nameLookup() below, never by direct index, so accent/case variants resolve.
// GENERATED:START
export const CONTRACT_DETAILS: Record<string, ContractDetail> = {
  "Nickeil Alexander-Walker": { tradeBonusPct: 7.5 },
  "OG Anunoby": { tradeBonusPct: 15 },
  "LaMelo Ball": { tradeBonusPct: 15 },
  "Nicolas Batum": { tradeBonusPct: 15 },
  "Bradley Beal": { tradeBonusPct: 15 },
  "Devin Booker": { tradeBonusPct: 10 },
  "Jalen Brunson": { tradeBonusPct: 15 },
  "Clint Capela": { tradeBonusPct: 5 },
  "Anthony Edwards": { tradeBonusPct: 15 },
  "Dorian Finney-Smith": { tradeBonusPct: 3.232 },
  "Paul George": { tradeBonusPct: 15 },
  "Shai Gilgeous-Alexander": { tradeBonusPct: 15 },
  "Rudy Gobert": { tradeBonusPct: 7.5 },
  "Aaron Gordon": { tradeBonusPct: 3 },
  "Draymond Green": { tradeBonusPct: 15 },
  "Tyrese Haliburton": { tradeBonusPct: 15 },
  "James Harden": { tradeBonusPct: 15 },
  "Al Horford": { tradeBonusPct: 15 },
  "Kyrie Irving": { tradeBonusPct: 15 },
  "LeBron James": { tradeBonusPct: 15, noTradeClause: true },
  "Ty Jerome": { tradeBonusPct: 15 },
  "Derrick Jones": { tradeBonusPct: 5 },
  "Jonathan Kuminga": { tradeBonusPct: 15 },
  "Kawhi Leonard": { tradeBonusPct: 15 },
  "Naji Marshall": { tradeBonusPct: 5 },
  "Austin Reaves": { tradeBonusPct: 15 },
  "Klay Thompson": { tradeBonusPct: 15 },
  "Matisse Thybulle": { tradeBonusPct: 15 },
  "Myles Turner": { tradeBonusPct: 15 },
  "Derrick White": { tradeBonusPct: 15 },
  "Trae Young": { tradeBonusPct: 15 },
  "Ivica Zubac": { tradeBonusPct: 5 },
  "Damian Lillard": { noTradeClause: true },
}
// GENERATED:END

const contractDetailOf = nameLookup(CONTRACT_DETAILS)

export function getContractDetail(playerName: string): ContractDetail | undefined {
  return contractDetailOf(playerName)
}
