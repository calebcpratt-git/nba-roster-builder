export type GuaranteeStatus = 'full' | 'partial' | 'non-guaranteed'

export interface SeasonGuarantee {
  status: GuaranteeStatus
  amount?: number        // for 'partial' — guaranteed portion in whole dollars
  guaranteeDate?: string  // ISO 'YYYY-MM-DD' the salary becomes fully guaranteed
}

export type AcquisitionMethod = 'draft' | 'trade' | 'free-agent' | 'waiver' | 'sign-and-trade' | 'extension'

export interface AcquisitionRecord {
  date: string // ISO 'YYYY-MM-DD'
  method: AcquisitionMethod
  team: string // team abbreviation the player joined via this transaction
}

export type AwardType = 'MVP' | 'DPOY' | 'All-NBA-1' | 'All-NBA-2' | 'All-NBA-3'

export interface AwardRecord {
  // Not `Season` — that union only covers the app's cap-sheet projection
  // window (2026-27 onward); award history reaches into past seasons.
  season: string // 'YYYY-YY', e.g. '2024-25'
  award: AwardType
}

export interface Player {
  id: string
  name: string
  team: string
  salary: Partial<Record<Season, number>>
  options: Partial<Record<Season, 'Player' | 'Team'>>
  isUserCreated?: boolean
  /** Absent season = assume 'full'. */
  guarantees?: Partial<Record<Season, SeasonGuarantee>>
  /** Ascending by date. Spans the last 5 completed seasons (Basketball-Reference) plus the current season (SalarySwish). */
  acquisitionHistory?: AcquisitionRecord[]
  onPlayoffRoster?: boolean
  /** Flat league-wide two-way salary, not a real negotiated figure. Excluded from Team Salary — see getEffectiveSalary. */
  contractType?: 'two-way'
}

// A hypothetical release (waiver) of a current-roster player. `date` drives
// which league year the dead money lands in and how much of the contract is
// guaranteed as of that date; `claimed` predicts whether another team claims
// him off waivers, which (if true) transfers the whole contract away instead
// of leaving guaranteed money behind as dead cap.
export interface ReleaseDetail {
  date: string // ISO 'YYYY-MM-DD'
  claimed: boolean
}

export interface SavedContract {
  id: string
  playerId: string
  playerName: string
  type: 'extension' | 'free-agent' | 'trade'
  salary: Partial<Record<Season, number>>
  createdAt: Date
  notes?: string
  isMinimum?: boolean
  /** Which signing exception funded this contract, if any. */
  exceptionType?: 'ntmle' | 'tmle' | 'bae'
  isMaxContract?: boolean
  /** Absent = standard contract. 'two-way' counts against the 3-slot limit and is excluded from Team Salary. */
  contractType?: 'two-way'
  /** Restricted-free-agency path this contract represents. Absent = not RFA-related. */
  rfaPath?: 'qualifying-offer' | 'offer-sheet' | 'matched-offer-sheet'
}

export interface CapThreshold {
  name: string
  value: number
  type: 'soft-cap' | 'salary-floor' | 'luxury-tax' | 'first-apron' | 'second-apron' | 'hard-cap'
  description: string
}

export interface Team {
  id: string
  name: string
  abbreviation: string
  city: string
  conference: 'Eastern' | 'Western'
  division: string
  primaryColor: string
  secondaryColor: string
}

export interface YearlyCapStatus {
  year: string
  totalSalary: number
  savedContractsSalary: number
  currentContractsSalary: number
  violations: CapThreshold[]
}

export type Season = '2026-27' | '2027-28' | '2028-29' | '2029-30' | '2030-31' | '2031-32' | '2032-33' | '2033-34' | '2034-35'

export const SEASONS: Season[] = ['2026-27', '2027-28', '2028-29', '2029-30', '2030-31', '2031-32', '2032-33', '2033-34', '2034-35']

export type CapStatus = 'Below Cap' | 'Over Cap' | 'Luxury Tax' | '1st Apron' | '2nd Apron'

// One asset changing hands, from one team to another. A trade is just a bag of
// these — which is what lets a deal involve three or more teams, including legs
// between two partners that never touch the user's own team (required by the
// CBA's touch rule, see checkTouchRule in trade-validation.ts).
//
// The snapshot fields are optional because an asset that still lives in the
// sending team's scraped data is re-resolved live on every read, so a daily
// scrape's salary correction flows through instead of being frozen at the
// moment the trade was built. Only assets with no live source — custom picks
// invented in the trade modal, and cash — depend on the snapshot. See
// resolveMovement in lib/trade-model.ts.
export interface TradeMovement {
  kind: 'player' | 'pick' | 'cash'
  /** Team abbreviation the asset leaves. */
  from: string
  /** Team abbreviation the asset arrives at. */
  to: string
  id: string
  name?: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  /** Pick legs only. Stored rather than parsed from `id`, because a custom pick invented in the trade modal has no `draft-{year}-{round}` id to parse. */
  pickYear?: number
  pickRound?: 1 | 2
  /** Cash legs only — dollars moving from `from` to `to`. */
  amount?: number
  /** Held trade exception (TEAM_CAP_STATE heldTPEs id) of the *receiving* team, absorbing this player instead of matched outgoing salary. */
  heldTpeId?: string
}

export interface SavedTrade {
  id: string
  createdAt: Date

  /** Every participant, the authoring team first. Length 2 = classic two-team trade. */
  teams?: string[]
  movements?: TradeMovement[]

  // ---- Legacy two-team fields ----
  // Written alongside `teams`/`movements` as the authoring team's own view of
  // the deal, so a sheet saved by this build still renders in a previously
  // deployed bundle. `movements` is the source of truth whenever it is present;
  // these are only read to upgrade sheets saved before multi-team trades
  // existed (see normalizeTrade).
  tradeTeamAbbr: string
  outgoingRosterPlayerIds: string[]
  outgoingPickIds: string[]
  incomingPlayers: Array<{
    playerId: string
    playerName: string
    salary: Partial<Record<Season, number>>
    options: Partial<Record<Season, 'Player' | 'Team'>>
    /** Held trade exception (TEAM_CAP_STATE heldTPEs id) absorbing this player instead of matched outgoing salary. */
    heldTpeId?: string
  }>
  incomingPicks: Array<{
    id: string
    name: string
    fromTeam: string
    salary: Partial<Record<Season, number>>
    options: Partial<Record<Season, 'Player' | 'Team'>>
  }>
  /** UI toggle — sign-and-trade hard-cap + 3-4yr / 1st-yr-guaranteed rule. Not yet enforced — see schema doc §6. */
  isSignAndTrade?: boolean
  /** Cash your side sends to the trade partner. */
  cashToPartner?: number
  /** Cash your side receives from the trade partner. */
  cashFromPartner?: number
}

// A saved cap sheet always covers a single team's builder state — see
// roster-context.tsx's per-team assumption (multi-team scenarios are out of
// scope for now).
export interface CapSheetSnapshot {
  savedContracts: SavedContract[]
  savedTrades: SavedTrade[]
  exercisedTeamOptionKeys: string[]
  exercisedPlayerOptionKeys: string[]
  deletedContractIds: string[]
  releasedRosterIds: string[]
  /** Absent (older saved sheets) — fall back to releasedRosterIds with today's date and claimed:false. */
  releaseDetails?: Record<string, ReleaseDetail>
  pickNumberOverrides: Record<string, number>
  /** Renounced free-agent cap holds — keys `${teamAbbr}-${season}-${holdLabel}`. */
  renouncedCapHoldKeys: string[]
}

export interface CapSheetSeasonSummary {
  season: Season
  total: number
  status: CapStatus
}

export interface CapSheetSummary {
  seasons: CapSheetSeasonSummary[]
  rosterCount: number
  moveCount: number
}

export interface CapSheet {
  id: string
  userId: string
  teamAbbr: string
  name: string
  snapshot: CapSheetSnapshot
  summary: CapSheetSummary
  createdAt: string
  updatedAt: string
}

export const TEAM_ABBREVIATIONS = [
  'ATL', 'BOS', 'BRK', 'CHO', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHO', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'
] as const

export type TeamAbbreviation = typeof TEAM_ABBREVIATIONS[number]
