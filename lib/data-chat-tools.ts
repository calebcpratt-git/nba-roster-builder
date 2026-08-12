// Tool definitions + executors for the /data dashboard's AI query panel,
// letting it answer questions by reading the app's real data entities
// (players, contracts, cap state, draft picks, free agents, league-cap
// figures) instead of guessing. Only imported by app/api/data-chat's
// dev-only route.

import { RAW_PLAYER_DATA, ALL_TEAMS, TEAM_NAMES } from './player-data'
import { getContractDetail } from './contract-details'
import { getTeamCapState } from './team-cap-state'
import { getPicksByTeamAbbr, getPicksByYear } from './draft-picks'
import { FREE_AGENT_POOL } from './free-agents'
import { CAP_THRESHOLDS, TEAMS } from './data'
import { LEAGUE_CAP } from './league-cap'
import { SEASONS, Season } from './types'

function isSeason(s: unknown): s is Season {
  return typeof s === 'string' && (SEASONS as string[]).includes(s)
}

function teamAbbrOf(input: unknown): string | undefined {
  return typeof input === 'string' ? input.toUpperCase() : undefined
}

export const TOOLS = [
  {
    name: 'list_teams',
    description: 'List every NBA team with its abbreviation, city, and colors.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_players',
    description:
      "Search the full player dataset by partial, case-insensitive name and/or team abbreviation. Returns each match's salary by season, options, and acquisition method.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Partial player name to match, e.g. "curry"' },
        teamAbbr: { type: 'string', description: '3-letter team abbreviation filter, e.g. "GSW"' },
        limit: { type: 'number', description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'get_team_roster',
    description: 'Get every rostered player for one team, with salaries by season and any options.',
    input_schema: {
      type: 'object',
      properties: { teamAbbr: { type: 'string', description: '3-letter team abbreviation, e.g. "BOS"' } },
      required: ['teamAbbr'],
    },
  },
  {
    name: 'get_contract_detail',
    description:
      'Get extra contract detail for one player: trade bonus %, incentives, signing exception, no-trade clause, prior-season salary, poison pill.',
    input_schema: {
      type: 'object',
      properties: { playerName: { type: 'string' } },
      required: ['playerName'],
    },
  },
  {
    name: 'get_team_cap_state',
    description:
      "Get a team's cap-state for one season: dead money, cap holds, held trade exceptions, apron addon, hard-cap status, cash ledger, exceptions used.",
    input_schema: {
      type: 'object',
      properties: {
        teamAbbr: { type: 'string' },
        season: { type: 'string', description: `One of: ${SEASONS.join(', ')}. Defaults to the earliest season.` },
      },
      required: ['teamAbbr'],
    },
  },
  {
    name: 'get_cap_thresholds',
    description: 'Get league-wide cap thresholds (soft cap, salary floor, luxury tax, first apron, second apron) for one season.',
    input_schema: {
      type: 'object',
      properties: { season: { type: 'string', description: `One of: ${SEASONS.join(', ')}` } },
      required: ['season'],
    },
  },
  {
    name: 'get_league_cap',
    description:
      'Get full league-cap figures for one season: top-line thresholds, salary-matching brackets, minimum-salary-by-years-of-service scale, exception amounts (MLE/BAE), cash-in-trade limit.',
    input_schema: {
      type: 'object',
      properties: { season: { type: 'string', description: `One of: ${SEASONS.join(', ')}` } },
      required: ['season'],
    },
  },
  {
    name: 'get_draft_picks',
    description:
      'Get draft picks, filtered by owning team abbreviation and/or draft year (at least one required). Includes protections and swap rights where known.',
    input_schema: {
      type: 'object',
      properties: {
        teamAbbr: { type: 'string' },
        year: { type: 'number' },
      },
    },
  },
  {
    name: 'get_free_agents',
    description: 'List currently-unsigned free agents, optionally filtered by prior team abbreviation or free-agent type.',
    input_schema: {
      type: 'object',
      properties: {
        teamAbbr: { type: 'string', description: 'Prior team abbreviation' },
        faType: { type: 'string', enum: ['unrestricted', 'restricted'] },
      },
    },
  },
] as const

export function runTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'list_teams':
      return Object.entries(TEAMS).map(([abbr, t]) => ({ abbr, ...t }))

    case 'search_players': {
      const query = typeof input.query === 'string' ? input.query.toLowerCase() : undefined
      const teamAbbr = teamAbbrOf(input.teamAbbr)
      const limit = typeof input.limit === 'number' ? input.limit : 20
      const results = RAW_PLAYER_DATA.filter((p) => {
        if (query && !p.name.toLowerCase().includes(query)) return false
        if (teamAbbr && p.team !== teamAbbr) return false
        return true
      }).slice(0, limit)
      return { count: results.length, players: results }
    }

    case 'get_team_roster': {
      const teamAbbr = teamAbbrOf(input.teamAbbr)
      if (!teamAbbr || !ALL_TEAMS.includes(teamAbbr)) return { error: `Unknown team abbreviation: ${input.teamAbbr}` }
      const roster = RAW_PLAYER_DATA.filter((p) => p.team === teamAbbr)
      return { team: teamAbbr, teamName: TEAM_NAMES[teamAbbr], count: roster.length, players: roster }
    }

    case 'get_contract_detail': {
      const playerName = typeof input.playerName === 'string' ? input.playerName : ''
      const detail = getContractDetail(playerName)
      return detail ?? { error: `No contract detail on file for "${playerName}"` }
    }

    case 'get_team_cap_state': {
      const teamAbbr = teamAbbrOf(input.teamAbbr)
      if (!teamAbbr) return { error: 'teamAbbr is required' }
      const season = isSeason(input.season) ? input.season : SEASONS[0]
      const state = getTeamCapState(teamAbbr, season)
      return state ? { team: teamAbbr, season, ...state } : { error: `No cap-state data for ${teamAbbr} in ${season}` }
    }

    case 'get_cap_thresholds': {
      const season = isSeason(input.season) ? input.season : SEASONS[0]
      return { season, thresholds: CAP_THRESHOLDS[season] }
    }

    case 'get_league_cap': {
      const season = isSeason(input.season) ? input.season : SEASONS[0]
      return { season, ...LEAGUE_CAP[season] }
    }

    case 'get_draft_picks': {
      const teamAbbr = teamAbbrOf(input.teamAbbr)
      const year = typeof input.year === 'number' ? input.year : undefined
      if (!teamAbbr && !year) return { error: 'Provide teamAbbr and/or year' }
      let picks = teamAbbr ? getPicksByTeamAbbr(teamAbbr) : getPicksByYear(year!)
      if (teamAbbr && year) picks = picks.filter((p) => p.year === year)
      return { count: picks.length, picks }
    }

    case 'get_free_agents': {
      const teamAbbr = teamAbbrOf(input.teamAbbr)
      const faType = input.faType === 'restricted' || input.faType === 'unrestricted' ? input.faType : undefined
      const results = FREE_AGENT_POOL.filter((fa) => {
        if (teamAbbr && fa.priorTeam !== teamAbbr) return false
        if (faType && fa.faType !== faType) return false
        return true
      })
      return { count: results.length, freeAgents: results }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
