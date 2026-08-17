import { SavedTrade, Season, TradeMovement } from './types'

// The canonical view of a trade: a participant list plus a flat bag of asset
// movements. Every consumer reads a trade through this shape rather than
// SavedTrade's legacy two-team fields, so a two-team deal and a five-team deal
// take exactly the same code path.
export interface NormalizedTrade {
  id: string
  createdAt: Date
  /** Every participant, authoring team first. Length 2 = classic two-team trade. */
  teams: string[]
  movements: TradeMovement[]
  isSignAndTrade?: boolean
}

// Cash counts as a "touch" in a 3+ team deal only above a floor, and never
// contributes salary, so it is filtered out of the asset selectors and summed
// separately. See checkTouchRule / checkCashInTrade in trade-validation.ts.
function isAsset(m: TradeMovement): boolean {
  return m.kind !== 'cash'
}

// Legacy trades stored outgoing assets as bare ids (resolved live against the
// authoring team's roster/contracts/picks) and incoming assets as full
// snapshots. Both map onto the same movement shape — an outgoing movement
// simply carries no snapshot, which is exactly what tells a consumer to resolve
// it live, preserving the pre-existing behavior where a daily scrape's salary
// correction flows into an already-saved trade.
function movementsFromLegacy(trade: SavedTrade, authoringTeamAbbr: string): TradeMovement[] {
  const partner = trade.tradeTeamAbbr
  const movements: TradeMovement[] = []

  trade.outgoingRosterPlayerIds.forEach((id) => {
    movements.push({ kind: 'player', from: authoringTeamAbbr, to: partner, id })
  })
  trade.outgoingPickIds.forEach((id) => {
    movements.push({ kind: 'pick', from: authoringTeamAbbr, to: partner, id })
  })
  trade.incomingPlayers.forEach((p) => {
    movements.push({
      kind: 'player',
      from: partner,
      to: authoringTeamAbbr,
      id: p.playerId,
      name: p.playerName,
      salary: p.salary,
      options: p.options,
      heldTpeId: p.heldTpeId,
    })
  })
  trade.incomingPicks.forEach((p) => {
    movements.push({
      kind: 'pick',
      from: p.fromTeam || partner,
      to: authoringTeamAbbr,
      id: p.id,
      name: p.name,
      salary: p.salary,
      options: p.options,
    })
  })
  if (trade.cashToPartner) {
    movements.push({
      kind: 'cash',
      from: authoringTeamAbbr,
      to: partner,
      id: `${trade.id}-cash-out`,
      name: 'Cash',
      amount: trade.cashToPartner,
    })
  }
  if (trade.cashFromPartner) {
    movements.push({
      kind: 'cash',
      from: partner,
      to: authoringTeamAbbr,
      id: `${trade.id}-cash-in`,
      name: 'Cash',
      amount: trade.cashFromPartner,
    })
  }

  return movements
}

// A team with no assets attached yet is still a participant — the touch rule
// has to be able to flag a team that touches nobody, which it can't do if the
// participant list is derived purely from movements. `teams` is therefore
// stored, and this is only the fallback for legacy rows and for hand-built
// trades that omit it.
function participantsFromMovements(movements: TradeMovement[], authoringTeamAbbr: string): string[] {
  const teams = [authoringTeamAbbr]
  movements.forEach((m) => {
    if (!teams.includes(m.from)) teams.push(m.from)
    if (!teams.includes(m.to)) teams.push(m.to)
  })
  return teams
}

export function normalizeTrade(trade: SavedTrade, authoringTeamAbbr: string): NormalizedTrade {
  const movements = trade.movements ?? movementsFromLegacy(trade, authoringTeamAbbr)
  const teams = trade.teams?.length
    ? trade.teams
    : participantsFromMovements(movements, authoringTeamAbbr)

  return {
    id: trade.id,
    createdAt: trade.createdAt,
    teams,
    movements,
    isSignAndTrade: trade.isSignAndTrade,
  }
}

// Mirrors the canonical shape back onto SavedTrade's legacy two-team fields as
// the authoring team's own view, so a sheet saved here still renders in a
// previously deployed bundle. For a 3+ team deal that projection is lossy by
// definition — partner-to-partner legs have nowhere to go — but `movements`
// carries the whole truth and always wins on read.
export function toSavedTrade(
  normalized: NormalizedTrade,
  authoringTeamAbbr: string
): SavedTrade {
  const { movements, teams } = normalized
  const partners = teams.filter((t) => t !== authoringTeamAbbr)
  const primaryPartner = partners[0] ?? authoringTeamAbbr

  const outgoing = movements.filter((m) => m.from === authoringTeamAbbr && isAsset(m))
  const incoming = movements.filter((m) => m.to === authoringTeamAbbr && isAsset(m))

  return {
    id: normalized.id,
    createdAt: normalized.createdAt,
    teams,
    movements,
    isSignAndTrade: normalized.isSignAndTrade,

    tradeTeamAbbr: primaryPartner,
    outgoingRosterPlayerIds: outgoing.filter((m) => m.kind === 'player').map((m) => m.id),
    outgoingPickIds: outgoing.filter((m) => m.kind === 'pick').map((m) => m.id),
    incomingPlayers: incoming
      .filter((m) => m.kind === 'player')
      .map((m) => ({
        playerId: m.id,
        playerName: m.name ?? m.id,
        salary: m.salary ?? {},
        options: m.options ?? {},
        heldTpeId: m.heldTpeId,
      })),
    incomingPicks: incoming
      .filter((m) => m.kind === 'pick')
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        fromTeam: m.from,
        salary: m.salary ?? {},
        options: m.options ?? {},
      })),
    cashToPartner: cashOutFor(normalized, authoringTeamAbbr) || undefined,
    cashFromPartner: cashInFor(normalized, authoringTeamAbbr) || undefined,
  }
}

// ---------------------------------------------------------------------------
// selectors — every consumer reads a trade through these
// ---------------------------------------------------------------------------

export function partnersOf(trade: NormalizedTrade, teamAbbr: string): string[] {
  return trade.teams.filter((t) => t !== teamAbbr)
}

export function outgoingFor(trade: NormalizedTrade, teamAbbr: string): TradeMovement[] {
  return trade.movements.filter((m) => m.from === teamAbbr && isAsset(m))
}

export function incomingFor(trade: NormalizedTrade, teamAbbr: string): TradeMovement[] {
  return trade.movements.filter((m) => m.to === teamAbbr && isAsset(m))
}

export function outgoingPlayersFor(trade: NormalizedTrade, teamAbbr: string): TradeMovement[] {
  return outgoingFor(trade, teamAbbr).filter((m) => m.kind === 'player')
}

export function outgoingPicksFor(trade: NormalizedTrade, teamAbbr: string): TradeMovement[] {
  return outgoingFor(trade, teamAbbr).filter((m) => m.kind === 'pick')
}

export function incomingPlayersFor(trade: NormalizedTrade, teamAbbr: string): TradeMovement[] {
  return incomingFor(trade, teamAbbr).filter((m) => m.kind === 'player')
}

export function incomingPicksFor(trade: NormalizedTrade, teamAbbr: string): TradeMovement[] {
  return incomingFor(trade, teamAbbr).filter((m) => m.kind === 'pick')
}

export function cashLegsFor(trade: NormalizedTrade, teamAbbr: string): TradeMovement[] {
  return trade.movements.filter((m) => m.kind === 'cash' && (m.from === teamAbbr || m.to === teamAbbr))
}

export function cashOutFor(trade: NormalizedTrade, teamAbbr: string): number {
  return trade.movements
    .filter((m) => m.kind === 'cash' && m.from === teamAbbr)
    .reduce((sum, m) => sum + (m.amount ?? 0), 0)
}

export function cashInFor(trade: NormalizedTrade, teamAbbr: string): number {
  return trade.movements
    .filter((m) => m.kind === 'cash' && m.to === teamAbbr)
    .reduce((sum, m) => sum + (m.amount ?? 0), 0)
}

/** Snapshotted salary for a movement. 0 for movements resolved live by the caller. */
export function movementSalary(m: TradeMovement, season: Season): number {
  return m.salary?.[season] ?? 0
}

// The earliest season at or after `from` in which any of these contracts
// carries salary — the season a trade is evaluated against. Takes plain salary
// maps rather than movements because callers pass *resolved* assets: an
// outgoing movement has no snapshot of its own, so asking a raw movement would
// see only the incoming half of the deal. Shared by the modal, the save-time
// guard, and the trades panel so they can't disagree.
export function firstSalarySeason(
  salaries: Array<Partial<Record<Season, number>>>,
  seasons: Season[],
  from: Season
): Season {
  const fromIndex = seasons.indexOf(from)
  const candidates = fromIndex === -1 ? seasons : seasons.slice(fromIndex)
  return candidates.find((s) => salaries.some((m) => (m[s] ?? 0) > 0)) ?? from
}
