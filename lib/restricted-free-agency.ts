import { Player, SavedContract, Season, SEASONS } from './types'
import { isRestrictedFreeAgent } from './contract-utils'

// The player's own team, own player's first season carrying no salary — same
// "first empty season" definition lib/free-agent-pool.ts's list uses,
// scoped to the currently selected team's roster instead of every team.
export function getOwnUnresolvedRFAs(
  roster: Player[],
  savedContracts: SavedContract[],
  deletedContractIds: Set<string>
): Array<{ player: Player; season: Season }> {
  const result: Array<{ player: Player; season: Season }> = []
  roster.forEach((player) => {
    const firstFreeSeason = SEASONS.find((s) => !(player.salary[s] && player.salary[s]! > 0))
    if (!firstFreeSeason) return
    if (!isRestrictedFreeAgent(player.name, firstFreeSeason)) return
    const covered = savedContracts.some(
      (c) => !deletedContractIds.has(c.id) && c.playerId === player.id && (c.salary[firstFreeSeason] ?? 0) > 0
    )
    if (covered) return
    result.push({ player, season: firstFreeSeason })
  })
  return result
}

export function summarizeContract(contract: SavedContract) {
  const activeSeasons = SEASONS.filter((s) => (contract.salary[s] ?? 0) > 0)
  const total = activeSeasons.reduce((sum, s) => sum + (contract.salary[s] ?? 0), 0)
  return { years: activeSeasons.length, total, firstSeason: activeSeasons[0] }
}
