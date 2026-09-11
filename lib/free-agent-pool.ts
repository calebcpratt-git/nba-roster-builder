import { SEASONS } from './types'
import type { Season, Player, SavedContract } from './types'
import { getTeamRoster, ALL_TEAMS } from './data'
import { FREE_AGENT_POOL } from './free-agents'

// Players whose first contract-free year in the DB matches `year` — the same
// filter both the panel's own list and any header/tab count badge use, kept
// in one place so they can't drift out of sync.
export function getAvailableFreeAgents(year: Season, savedContracts: SavedContract[]): Player[] {
  const freeAgents: Player[] = []
  const seenNames = new Set<string>()

  ALL_TEAMS.forEach((teamAbbr) => {
    const teamRoster = getTeamRoster(teamAbbr)

    teamRoster.forEach((player) => {
      // Find the first season where the player has no salary in the database
      const firstFreeSeason = SEASONS.find((s) => !(player.salary[s] && player.salary[s]! > 0))

      // Only show the player in the year that is their first year without a contract
      if (!firstFreeSeason || firstFreeSeason !== year) return

      // Skip if an extension already covers this year
      const hasExtensionThisYear = savedContracts.some(
        (c) =>
          c.type === 'extension' &&
          c.playerId === player.id &&
          c.salary[year] &&
          c.salary[year]! > 0
      )
      if (hasExtensionThisYear) return

      freeAgents.push(player)
      seenNames.add(player.name)
    })
  })

  // RealGM's current-free-agents pool (lib/free-agents.ts) covers players
  // with no roster row in player-data.ts at all — they're unsigned right
  // now, so they never show up in the loop above. Only valid for the
  // current free-agency period: it's a snapshot of who's unsigned today,
  // not a projection of future years' free agents.
  if (year === SEASONS[0]) {
    FREE_AGENT_POOL.forEach((fa, idx) => {
      if (seenNames.has(fa.name)) return

      const id = `fa-${idx}`
      const hasExtensionThisYear = savedContracts.some(
        (c) => c.type === 'extension' && c.playerId === id && c.salary[year] && c.salary[year]! > 0
      )
      if (hasExtensionThisYear) return

      freeAgents.push({ id, name: fa.name, team: fa.priorTeam, salary: {}, options: {} })
      seenNames.add(fa.name)
    })
  }

  return freeAgents.sort((a, b) => (b.salary['2026-27'] || 0) - (a.salary['2026-27'] || 0))
}
