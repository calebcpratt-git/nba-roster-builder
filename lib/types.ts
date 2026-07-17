export interface Player {
  id: string
  name: string
  team: string
  salary: Partial<Record<Season, number>>
  options: Partial<Record<Season, 'Player' | 'Team'>>
  isUserCreated?: boolean
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
  isMLE?: boolean
  isMaxContract?: boolean
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

export interface SavedTrade {
  id: string
  tradeTeamAbbr: string
  createdAt: Date
  outgoingRosterPlayerIds: string[]
  outgoingPickIds: string[]
  incomingPlayers: Array<{
    playerId: string
    playerName: string
    salary: Partial<Record<Season, number>>
    options: Partial<Record<Season, 'Player' | 'Team'>>
  }>
  incomingPicks: Array<{
    id: string
    name: string
    fromTeam: string
    salary: Partial<Record<Season, number>>
    options: Partial<Record<Season, 'Player' | 'Team'>>
  }>
}

export const TEAM_ABBREVIATIONS = [
  'ATL', 'BOS', 'BRK', 'CHO', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHO', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'
] as const

export type TeamAbbreviation = typeof TEAM_ABBREVIATIONS[number]
