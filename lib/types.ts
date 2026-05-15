export interface Player {
  id: string
  name: string
  position: string
  jerseyNumber: number
  salary: Record<string, number> // year -> salary
  contractType: 'guaranteed' | 'non-guaranteed' | 'partially-guaranteed'
  teamOption?: string // year the team option applies
  playerOption?: string // year the player option applies
  isUserCreated?: boolean
}

export interface SavedContract {
  id: string
  playerId: string
  playerName: string
  type: 'extension' | 'free-agent' | 'trade'
  salary: Record<string, number>
  createdAt: Date
  notes?: string
}

export interface CapThreshold {
  name: string
  value: number
  type: 'soft-cap' | 'luxury-tax' | 'first-apron' | 'second-apron' | 'hard-cap'
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

export type Season = '2025-26' | '2026-27' | '2027-28' | '2028-29' | '2029-30'

export const SEASONS: Season[] = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30']
