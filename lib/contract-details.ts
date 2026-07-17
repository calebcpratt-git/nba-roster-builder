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
export const CONTRACT_DETAILS: Record<string, ContractDetail> = {
  // 'Jalen Brunson': { tradeBonusPct: 15, signedUnder: 'bird' },
  // 'Some Player': { noTradeClause: true },
}

const contractDetailOf = nameLookup(CONTRACT_DETAILS)

export function getContractDetail(playerName: string): ContractDetail | undefined {
  return contractDetailOf(playerName)
}
