import { Season } from './types'

export interface DeadMoney { player: string; amount: number }        // waived/stretched cap hits
export interface CapHold   { label: string; amount: number; kind: 'free-agent' | 'empty-roster' | 'draft-pick' }
export interface HeldTPE   { id: string; amount: number; expires: string /* ISO date */; fromPlayer?: string }

export interface TeamCapSeason {
  deadMoney: DeadMoney[]
  capHolds: CapHold[]        // offseason only
  heldTPEs: HeldTPE[]        // traded-player exceptions available to absorb salary
  /** unlikely-bonus + exception amounts folded in so apron figure ≠ raw payroll */
  apronAddon?: number
}

// abbr -> season -> state. Sparse and empty by design — no team facts have
// been sourced yet. Every existing team's preTradeTotal is computed exactly
// as it was before this table existed until entries are added here.
export const TEAM_CAP_STATE: Record<string, Partial<Record<Season, TeamCapSeason>>> = {
  // BOS: { '2026-27': { deadMoney: [{ player: 'X', amount: 2100000 }], capHolds: [], heldTPEs: [] } },
}

export function getTeamCapState(teamAbbr: string, season: Season): TeamCapSeason | undefined {
  return TEAM_CAP_STATE[teamAbbr]?.[season]
}
