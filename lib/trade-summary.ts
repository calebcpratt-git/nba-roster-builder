import { SEASONS, Season } from './types'
import { NormalizedTrade, incomingFor, outgoingFor, partnersOf } from './trade-model'
import { TEAM_NAMES } from './data'

type SalaryMap = Partial<Record<Season, number>>

interface LiveAsset {
  id: string
  name?: string
  salary: SalaryMap
}

/**
 * Outgoing movements carry no salary snapshot — they're deliberately resolved
 * live against the roster and pick lists so a daily scrape's salary correction
 * flows into an already-saved trade. Incoming movements do carry one, because
 * the partner's roster isn't the selected team's to re-read.
 */
function resolvedSalary(
  movementId: string,
  snapshot: SalaryMap | undefined,
  roster: LiveAsset[],
  draftPickPlayers: LiveAsset[]
): SalaryMap {
  const live = roster.find((p) => p.id === movementId) ?? draftPickPlayers.find((p) => p.id === movementId)
  return live?.salary ?? snapshot ?? {}
}

/**
 * The trade's first affected season, and the selected team's totals for just
 * that season — the "out $X → in $Y" headline both panels show.
 */
export function getTradeFirstSeasonTotals(
  trade: NormalizedTrade,
  teamAbbr: string,
  roster: LiveAsset[],
  draftPickPlayers: LiveAsset[]
) {
  const outgoing = outgoingFor(trade, teamAbbr).map((m) => resolvedSalary(m.id, m.salary, roster, draftPickPlayers))
  const incoming: SalaryMap[] = incomingFor(trade, teamAbbr).map((m) => m.salary ?? {})

  const firstSeasonIndex = SEASONS.findIndex((season) =>
    outgoing.some((s) => s[season]) || incoming.some((s) => s[season])
  )
  const season = SEASONS[firstSeasonIndex === -1 ? 0 : firstSeasonIndex]

  return {
    season,
    outgoingTotal: outgoing.reduce((sum, s) => sum + (s[season] || 0), 0),
    incomingTotal: incoming.reduce((sum, s) => sum + (s[season] || 0), 0),
  }
}

export interface TradeAssetRow {
  key: string
  direction: 'OUT' | 'IN'
  name: string
  /** The other team on this leg — where it's going, or where it came from. */
  team: string
  amount: number
}

/** Every asset in the deal from the selected team's point of view, out first. */
export function resolveTradeAssets(
  trade: NormalizedTrade,
  teamAbbr: string,
  roster: LiveAsset[],
  draftPickPlayers: LiveAsset[]
): TradeAssetRow[] {
  const { season } = getTradeFirstSeasonTotals(trade, teamAbbr, roster, draftPickPlayers)

  const out = outgoingFor(trade, teamAbbr).map((m) => {
    const live = roster.find((p) => p.id === m.id) ?? draftPickPlayers.find((p) => p.id === m.id)
    const salary = resolvedSalary(m.id, m.salary, roster, draftPickPlayers)
    return {
      key: `out-${m.from}-${m.id}`,
      direction: 'OUT' as const,
      name: m.name ?? live?.name ?? m.id,
      team: m.to,
      amount: salary[season] ?? 0,
    }
  })

  const incoming = incomingFor(trade, teamAbbr).map((m) => ({
    key: `in-${m.from}-${m.id}`,
    direction: 'IN' as const,
    name: m.name ?? m.id,
    team: m.from,
    amount: m.salary?.[season] ?? 0,
  }))

  return [...out, ...incoming]
}

/** "Trade with Boston Celtics" for a two-team deal; "3-team trade with BOS, LAL" once a single partner name no longer describes it. */
export function describeTradePartners(trade: NormalizedTrade, teamAbbr: string): string {
  const partners = partnersOf(trade, teamAbbr)
  if (partners.length <= 1) {
    const only = partners[0]
    return `Trade with ${only ? TEAM_NAMES[only] || only : 'no partner'}`
  }
  return `${trade.teams.length}-team trade with ${partners.join(', ')}`
}
