// Wire types shared by the GM assistant's client (components/gm-chat) and its
// API route (app/api/gm-chat). Deliberately free of React and of any module
// marked 'use client', so the server route can import it without pulling the
// roster context into a server bundle.

import type { CapStatus, Season } from '../types'

/**
 * Which part of the app the chat was opened from. The surface picks the
 * prompt addendum (see lib/gm-chat/prompt.ts) so the same assistant can be
 * dropped into the trade builder or the free-agent modal and lead with what
 * the user is doing there. Only 'home' is wired up so far.
 */
export type GmChatSurface = 'home' | 'trade' | 'sign-free-agent'

export interface GmChatSeasonLine {
  season: Season
  /** Team Salary as the cap-space rules count it (what "cap room" is measured against). */
  capSpaceTotal: number
  /** Apron Team Salary — the separate total the tax and both aprons are measured against. */
  apronTotal: number
  /** Classification of `apronTotal` against the tax/apron lines — the total those lines actually test. */
  apronStatus: CapStatus
  softCap: number
  salaryFloor: number
  luxuryTax: number
  firstApron: number
  secondApron: number
  /** Positive = room under the line, negative = over it. */
  capSpace: number
  underTax: number
  underFirstApron: number
  underSecondApron: number
}

export interface GmChatRosterRow {
  name: string
  /** Effective salary per season — options and guarantees already applied. */
  salary: Partial<Record<Season, number>>
  options: Array<{ season: Season; type: 'Player' | 'Team'; decision: 'exercised' | 'declined' | 'undecided' }>
  guarantees?: Partial<Record<Season, { status: string; amount?: number; guaranteeDate?: string }>>
  contractType?: 'two-way'
  /** Set when the user has waived him in the builder — he is off the roster but may leave dead money. */
  releasedOn?: { date: string; claimed: boolean }
  /** Set when the user has this player heading out in a saved trade. */
  tradedTo?: string
}

export interface GmChatPendingMoves {
  signings: Array<{
    player: string
    kind: 'extension' | 'free-agent' | 'trade'
    salary: Partial<Record<Season, number>>
    exceptionType?: string
    isMinimum?: boolean
    isMaxContract?: boolean
    contractType?: 'two-way'
    rfaPath?: string
  }>
  trades: Array<{ teams: string[]; isSignAndTrade?: boolean; legs: string[] }>
  optionDecisions: Array<{ player: string; season: Season; type: 'Player' | 'Team'; decision: 'exercised' | 'declined' }>
  releases: Array<{ player: string; date: string; claimed: boolean }>
  renouncedCapHolds: string[]
}

/** Cap-sheet facts that are only meaningful for the season being worked in. */
export interface GmChatSeasonDetail {
  season: Season
  capHolds: Array<{ label: string; amount: number; kind: string; birdRights?: string }>
  deadMoney: Array<{ player: string; amount: number }>
  releaseDeadMoney: Array<{ player: string; amount: number }>
  signingExceptions: Array<{ label: string; eligible: boolean; alreadyUsed: boolean }>
  tradeExceptions: Array<{ amount: number; expires: string; daysLeft: number; locked: boolean; fromPlayer?: string }>
  hardCapped?: { apron: 1 | 2; trigger?: string }
  cash?: { availableToSend: number; availableToReceive: number }
}

/**
 * Everything the assistant needs about the sheet the user is actually looking
 * at. League-wide facts are NOT in here — the model reaches those through the
 * tools in lib/gm-chat/tools.ts, which keeps this payload small enough to send
 * on every turn.
 */
export interface GmChatContext {
  team: { abbr: string; name: string; city: string }
  seasons: GmChatSeasonLine[]
  roster: GmChatRosterRow[]
  incomingDraftPicks: Array<{ name: string; salary: Partial<Record<Season, number>> }>
  ownedPicks: Array<{ year: number; round: string; via?: string; protections?: string; swap?: string; frozen?: boolean }>
  pendingMoves: GmChatPendingMoves
  seasonDetail: GmChatSeasonDetail
  sheet: { name: string | null; unsavedChanges: boolean; rosterCount: number; moveCount: number }
}

/**
 * Surface-specific detail, supplied by the panel the chat was opened from.
 * The homepage chat sends none; the trade and free-agent panels send the
 * working state of the move the user is in the middle of, which is what makes
 * those chats specialists rather than the general assistant with a new prompt.
 */
/** The deal on the trade board, as useTradeBuilder hands it up. */
export interface TradeDraftSnapshot {
  teams: string[]
  legs: string[]
  outgoingTotal: number
  incomingTotal: number
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface TradeChatFocus {
  kind: 'trade'
  season: Season
  /** What this team is allowed to do in a trade at its current apron tier. */
  rules: {
    apronStatus: CapStatus
    salaryMatch: string
    canAggregate: boolean
    canTakeBackMoreSalary: boolean
    canReceiveSignAndTrade: boolean
    canUseCash: boolean
    cashAvailableToSend: number
    cashAvailableToReceive: number
    hardCappedAt?: 1 | 2
  }
  /** The deal currently on the board, if the builder is open with assets in it. */
  draft?: TradeDraftSnapshot
  /** Picks this team cannot trade, with the reason. */
  untradeablePicks: Array<{ year: number; round: string; reason: string }>
}

export interface FreeAgentChatFocus {
  kind: 'free-agent'
  season: Season
  /** Room under the cap this season — negative means over it. */
  capRoom: number
  /** Every signing mechanism with the dollar figure it is worth this season. */
  mechanisms: Array<{ label: string; eligible: boolean; alreadyUsed: boolean; amount?: number }>
  minimumSalary: number
  /** The pool the panel is showing, trimmed to what fits in a prompt. */
  available: Array<{ name: string; priorTeam?: string; faType?: string; capHold?: number }>
  availableCount: number
  /** This team's own unresolved restricted free agents. */
  unresolvedRFAs: string[]
  /** Offer sheets from other teams awaiting a match decision. */
  pendingOfferSheets: Array<{ player: string; fromTeam: string; salary: Partial<Record<Season, number>> }>
}

export type GmChatFocus = TradeChatFocus | FreeAgentChatFocus

export type GmChatMessage = { role: 'user' | 'assistant'; content: string }

export interface GmChatRequest {
  messages: GmChatMessage[]
  surface: GmChatSurface
  context: GmChatContext
  focus?: GmChatFocus
}

/** Newline-delimited JSON events streamed back from the route. */
export type GmChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
