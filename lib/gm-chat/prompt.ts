// System prompt and live-context rendering for the GM assistant.
//
// Split in two on purpose: BASE_PROMPT plus the surface addendum is byte-stable
// across a conversation (so it can carry a cache breakpoint), while the user's
// cap sheet is re-rendered every turn and sent as a trailing mid-conversation
// system message. See app/api/gm-chat/route.ts.

import { SEASONS } from '../types'
import type { FreeAgentChatFocus, GmChatContext, GmChatFocus, GmChatSurface, TradeChatFocus } from './types'

const BASE_PROMPT = `You are the assistant GM inside Association GM, an NBA roster and cap-sheet builder. You help the user understand their team's cap situation under the 2023 CBA and figure out what moves are available to them.

The user is working on a pro forma cap sheet that projects forward from ${SEASONS[0]}. Every move on it is hypothetical — signings, trades, option decisions, and releases the user is trying out, not real transactions.

How to work:
- The CURRENT CAP SHEET block is the authoritative state of the user's own team, including every unsaved move they have made. Always answer questions about "my team", "we", or "us" from that block — never from your own memory of NBA rosters, and never from the tools (the tools return the untouched scraped league data, which does not include the user's moves).
- **Do not look up what you have already been given.** Every figure in the blocks below — salaries, team totals, thresholds, exception availability, the deal on the trade board and its validator verdict — is already authoritative. Re-fetching it wastes the user's time and risks contradicting the sheet in front of them.
- Reach for a tool only to fill a genuine gap: another team's roster or cap state, a player not on this sheet, a contract detail the sheet does not carry. Prefer one targeted call over several broad ones, and answer as soon as you can support the answer. Never guess a salary or a threshold you could look up — but never look up a number you were handed.
- Distinguish the two team totals the CBA keeps separate: Team Salary (what cap space is measured against) and Apron Team Salary (what the tax line and both aprons are measured against). The sheet gives you both.
- When you suggest a move, say what makes it legal — which exception or trade-matching bracket funds it, and what it does to the team's distance from the tax line and the aprons. Call out apron restrictions (aggregation, sign-and-trade, taking back more salary, frozen picks) when they apply, and say plainly when a move is not legal.
- Be concrete. Name players and dollar figures rather than describing categories of moves.

How to answer:
- Lead with the answer. Two or three sentences of prose for a simple question; short bullet lists for options or comparisons.
- The chat panel is narrow — never use markdown tables. Use short bullets instead. Bold (**like this**) and bullets starting with "- " render; nothing else does.
- Format money the way the app does: $12.4M for round numbers, exact dollars when precision matters.
- If the data needed to answer is missing or a tool errors, say so rather than filling the gap with a guess. Projected future-season figures are projections — flag that when it changes the answer.`

const SURFACE_PROMPTS: Record<GmChatSurface, string> = {
  home: `The user opened you from the main cap-sheet screen, so questions can range over anything: the shape of the payroll, who is worth moving, which exceptions are still live, what to do with an option. Offer a next move when it is useful, but answer what was asked first.`,

  trade: `You are opened from the trade panel, so you are a trade specialist. Treat every question as being about moving salary and assets, and lead with legality.

Work the deal in this order:
1. **Does it match salary?** Compare outgoing and incoming against the team's bracket. Under the first apron the expanded bands apply (125% + $250K up to $7.25M outgoing, outgoing + $8,527,000 in the middle band, 125% above $29M); at or over either apron it is 100%, dollar-for-dollar. Say which bracket applies and what the exact maximum incoming figure is.
2. **Is the team allowed to make it at all?** Over the first apron: no taking back more salary than is sent, no receiving a sign-and-trade, no using a trade exception generated in a prior league year. Over the second apron: no aggregating two or more players into one incoming salary, no cash in trades, no trading a first-rounder seven years out. If the team is hard-capped, no move may cross that line for the rest of the league year regardless of the rest of the math.
3. **What does it do to their position?** Where the deal leaves Apron Team Salary relative to the tax line and both aprons, and whether it triggers a new hard cap.
4. **What would fix it?** If the deal fails, name the specific filler salary, trade exception, or extra partner that makes it work. Be concrete about which player on the roster is the right ballast.

The TRADE BOARD block already gives you the legs, both salary totals, and the app validator's own verdict on the deal. Start from those figures rather than re-deriving them from rosters.

Also cover, when relevant: trade exceptions (amount, expiry, and the first-apron lockout), cash limits, base-year compensation, poison-pill contracts, no-trade clauses, trade bonuses, the Stepien rule on consecutive future firsts, and the touch rule in three-team deals. If a trade is on the board and it is valid, say so plainly and move on to what it costs them rather than manufacturing objections.`,

  'sign-free-agent': `You are opened from the free-agent panel, so you are a signings specialist. Treat every question as being about how to add a player, and lead with the mechanism.

Work a signing in this order:
1. **What funds it?** Cap room, the Non-Taxpayer or Taxpayer MLE, the Room Exception, the Bi-Annual, the Disabled Player Exception, minimum-salary, or Bird / Early Bird / Non-Bird rights on their own free agent. Name it, say whether it is still unused this league year, and give its exact dollar figure. A team with cap room must use the room first and gets only the Room Exception afterward — it does not get the full MLE.
2. **How much can they actually offer?** The most the mechanism allows in year one, the legal raise (8% off a cap-room or exception deal, 5% off Bird rights), and the maximum number of years. For a max contract, work off the right 25/30/35% tier for the player's years of service.
3. **What does it cost them?** Where the signing leaves Team Salary and Apron Team Salary, and — critically — whether it hard-caps them. Using the Non-Taxpayer MLE, the Bi-Annual, or taking in a sign-and-trade hard-caps at the first apron; those are one-way doors for the rest of the league year. Say so every time one is in play.
4. **Restricted free agents.** For their own RFAs, cover the qualifying offer, the right of first refusal, the two-day match window, and what an outside offer sheet can be structured to do (the third-year balloon). For an offer sheet already on the board, answer the match-or-decline question directly.

The SIGNING BOARD block already gives you the room, the mechanisms with their dollar figures, and the pool the panel is showing. Start from those.

Cap holds matter here: a team keeps a free agent's hold on the books until they sign him or renounce him, and renouncing is what creates the room. When the user asks what they can afford, say which holds have to go first.`,
}

export function systemPrompt(surface: GmChatSurface): string {
  return `${BASE_PROMPT}\n\n${SURFACE_PROMPTS[surface] ?? SURFACE_PROMPTS.home}`
}

function money(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`
}

/** "$2,985,000 over" reads better than a negative "under" for a blown line. */
function gap(value: number): string {
  return `${money(Math.abs(value))} ${value >= 0 ? 'under' : 'over'}`
}

function salaryLine(salary: Partial<Record<string, number>>): string {
  const entries = Object.entries(salary).filter(([, v]) => (v ?? 0) > 0)
  if (entries.length === 0) return 'no salary in the displayed window'
  return entries.map(([season, v]) => `${season} ${money(v!)}`).join(', ')
}

/** Renders the user's live sheet as the operator-authored context block. */
export function renderContext(ctx: GmChatContext): string {
  const lines: string[] = []
  lines.push('CURRENT CAP SHEET')
  lines.push(`Team: ${ctx.team.city} ${ctx.team.name} (${ctx.team.abbr})`)
  lines.push(
    `Sheet: ${ctx.sheet.name ?? 'unsaved working sheet'}${ctx.sheet.unsavedChanges ? ' (unsaved changes)' : ''} — ` +
      `${ctx.sheet.rosterCount} players under contract, ${ctx.sheet.moveCount} pending move(s)`
  )

  lines.push('', 'Payroll by season (includes every pending move):')
  ctx.seasons.forEach((s) => {
    lines.push(
      `- ${s.season}: Team Salary ${money(s.capSpaceTotal)}, Apron Team Salary ${money(s.apronTotal)} (${s.apronStatus}). ` +
        `Cap ${money(s.softCap)} (${s.capSpace >= 0 ? `${money(s.capSpace)} of room` : `${money(-s.capSpace)} over`}), ` +
        `tax ${money(s.luxuryTax)} (${gap(s.underTax)}), ` +
        `1st apron ${money(s.firstApron)} (${gap(s.underFirstApron)}), ` +
        `2nd apron ${money(s.secondApron)} (${gap(s.underSecondApron)}), ` +
        `floor ${money(s.salaryFloor)}`
    )
  })

  lines.push('', 'Roster (effective salary — options and guarantees applied):')
  ctx.roster.forEach((p) => {
    const flags: string[] = []
    if (p.contractType === 'two-way') flags.push('two-way')
    p.options.forEach((o) => flags.push(`${o.season} ${o.type} option: ${o.decision}`))
    Object.entries(p.guarantees ?? {}).forEach(([season, g]) => {
      if (!g || g.status === 'full') return
      flags.push(
        `${season} ${g.status}${g.amount ? ` (${money(g.amount)} guaranteed)` : ''}${g.guaranteeDate ? `, guarantee date ${g.guaranteeDate}` : ''}`
      )
    })
    if (p.releasedOn) flags.push(`WAIVED on this sheet ${p.releasedOn.date}${p.releasedOn.claimed ? ', claimed off waivers' : ''}`)
    if (p.tradedTo) flags.push(`TRADED to ${p.tradedTo} on this sheet`)
    lines.push(`- ${p.name}: ${salaryLine(p.salary)}${flags.length ? ` [${flags.join('; ')}]` : ''}`)
  })

  if (ctx.incomingDraftPicks.length > 0) {
    lines.push('', 'Incoming draft picks already on the sheet as rookie-scale slots:')
    ctx.incomingDraftPicks.forEach((p) => lines.push(`- ${p.name}: ${salaryLine(p.salary)}`))
  }

  const m = ctx.pendingMoves
  lines.push('', 'Pending moves on this sheet:')
  if (
    m.signings.length + m.trades.length + m.optionDecisions.length + m.releases.length + m.renouncedCapHolds.length ===
    0
  ) {
    lines.push('- none yet; this is the untouched roster')
  }
  m.signings.forEach((s) => {
    const tags = [
      s.kind,
      s.isMaxContract ? 'max' : null,
      s.isMinimum ? 'minimum' : null,
      s.contractType,
      s.exceptionType ? `funded by ${s.exceptionType}` : null,
      s.rfaPath,
    ].filter(Boolean)
    lines.push(`- Signed ${s.player} (${tags.join(', ')}): ${salaryLine(s.salary)}`)
  })
  m.trades.forEach((t) =>
    lines.push(`- Trade with ${t.teams.join(' / ')}${t.isSignAndTrade ? ' (sign-and-trade)' : ''}: ${t.legs.join('; ')}`)
  )
  m.optionDecisions.forEach((o) => lines.push(`- ${o.player}'s ${o.season} ${o.type} option: ${o.decision}`))
  m.releases.forEach((r) => lines.push(`- Waived ${r.player} on ${r.date}${r.claimed ? ' (claimed)' : ''}`))
  m.renouncedCapHolds.forEach((h) => lines.push(`- Renounced cap hold: ${h}`))

  const d = ctx.seasonDetail
  lines.push('', `${d.season} cap-sheet detail:`)
  if (d.hardCapped) {
    lines.push(
      `- HARD-CAPPED at the ${d.hardCapped.apron === 1 ? 'first' : 'second'} apron${d.hardCapped.trigger ? ` (${d.hardCapped.trigger})` : ''} — no move may cross that line this league year.`
    )
  }
  d.capHolds.forEach((h) =>
    lines.push(`- Cap hold: ${h.label} ${money(h.amount)} (${h.kind}${h.birdRights ? `, ${h.birdRights}` : ''})`)
  )
  d.deadMoney.forEach((x) => lines.push(`- Dead money: ${x.player} ${money(x.amount)}`))
  d.releaseDeadMoney.forEach((x) => lines.push(`- Dead money from a waiver on this sheet: ${x.player} ${money(x.amount)}`))
  d.signingExceptions.forEach((e) =>
    lines.push(`- Signing exception ${e.label}: ${e.alreadyUsed ? 'already used' : e.eligible ? 'available' : 'not eligible'}`)
  )
  d.tradeExceptions.forEach((t) =>
    lines.push(
      `- Trade exception ${money(t.amount)}${t.fromPlayer ? ` (from ${t.fromPlayer})` : ''}, expires ${t.expires} (${t.daysLeft}d)${t.locked ? ' — locked, team is over the first apron' : ''}`
    )
  )
  if (d.cash) {
    lines.push(`- Cash in trade: ${money(d.cash.availableToSend)} left to send, ${money(d.cash.availableToReceive)} to receive`)
  }

  if (ctx.ownedPicks.length > 0) {
    lines.push('', 'Draft picks owned:')
    ctx.ownedPicks.forEach((p) =>
      lines.push(
        `- ${p.year} ${p.round}${p.via ? ` via ${p.via}` : ''}${p.protections ? ` — ${p.protections}` : ''}${p.swap ? ` — swap: ${p.swap}` : ''}${p.frozen ? ' — FROZEN (untradeable, second-apron rule)' : ''}`
      )
    )
  }

  return lines.join('\n')
}

/**
 * Renders the surface-specific working state. Appended after the cap sheet so
 * the specialist chats lead with the move in front of the user rather than
 * having to infer it from the roster.
 */
export function renderFocus(focus: GmChatFocus): string {
  return focus.kind === 'trade' ? renderTradeFocus(focus) : renderFreeAgentFocus(focus)
}

function yesNo(allowed: boolean, allowedText: string, blockedText: string): string {
  return allowed ? allowedText : blockedText
}

function renderTradeFocus(focus: TradeChatFocus): string {
  const { rules } = focus
  const lines: string[] = ['TRADE BOARD', `Evaluated for ${focus.season}. Team is ${rules.apronStatus}.`]

  lines.push('', 'What this team may do in a trade right now:')
  lines.push(`- Salary matching: ${rules.salaryMatch}`)
  lines.push(`- ${yesNo(rules.canAggregate, 'May aggregate multiple players into one incoming salary', 'MAY NOT aggregate players (second apron)')}`)
  lines.push(`- ${yesNo(rules.canTakeBackMoreSalary, 'May take back more salary than it sends', 'MAY NOT take back more salary than it sends (first apron)')}`)
  lines.push(`- ${yesNo(rules.canReceiveSignAndTrade, 'May receive a sign-and-trade', 'MAY NOT receive a sign-and-trade (first apron)')}`)
  lines.push(
    `- ${yesNo(rules.canUseCash, `May use cash: ${money(rules.cashAvailableToSend)} left to send, ${money(rules.cashAvailableToReceive)} to receive`, 'MAY NOT send or receive cash (second apron)')}`
  )
  if (rules.hardCappedAt) {
    lines.push(`- HARD-CAPPED at the ${rules.hardCappedAt === 1 ? 'first' : 'second'} apron — no trade may cross that line this league year.`)
  }
  focus.untradeablePicks.forEach((p) => lines.push(`- ${p.year} ${p.round} cannot be traded: ${p.reason}`))

  if (focus.draft) {
    const d = focus.draft
    lines.push('', `Deal currently on the board (${d.teams.join(' / ')}):`)
    d.legs.forEach((leg) => lines.push(`- ${leg}`))
    lines.push(
      `- Your side: ${money(d.outgoingTotal)} out, ${money(d.incomingTotal)} in (net ${money(d.incomingTotal - d.outgoingTotal)})`
    )
    lines.push(`- The app's validator says this deal is currently ${d.isValid ? 'LEGAL' : 'ILLEGAL'}.`)
    d.errors.forEach((e) => lines.push(`  - Error: ${e}`))
    d.warnings.forEach((w) => lines.push(`  - Warning: ${w}`))
  } else {
    lines.push('', 'The trade board is empty — no assets have been added yet.')
  }

  return lines.join('\n')
}

function renderFreeAgentFocus(focus: FreeAgentChatFocus): string {
  const lines: string[] = ['SIGNING BOARD', `Signing for ${focus.season}.`]
  lines.push(
    focus.capRoom >= 0
      ? `- Cap room: ${money(focus.capRoom)}`
      : `- No cap room — ${money(-focus.capRoom)} over the cap, so signings must come through an exception or the minimum.`
  )
  lines.push(`- Minimum salary (2+ years of service): ${money(focus.minimumSalary)}`)

  lines.push('', 'Signing mechanisms this season:')
  focus.mechanisms.forEach((m) => {
    const state = m.alreadyUsed ? 'ALREADY USED' : m.eligible ? 'available' : 'not eligible'
    lines.push(`- ${m.label}${m.amount ? ` (${money(m.amount)})` : ''}: ${state}`)
  })

  if (focus.unresolvedRFAs.length > 0) {
    lines.push('', `Own restricted free agents still unresolved: ${focus.unresolvedRFAs.join(', ')}`)
  }
  if (focus.pendingOfferSheets.length > 0) {
    lines.push('', 'Offer sheets awaiting a match decision:')
    focus.pendingOfferSheets.forEach((o) =>
      lines.push(`- ${o.player} from ${o.fromTeam}: ${salaryLine(o.salary)}`)
    )
  }

  lines.push('', `Free agents available in the panel (${focus.availableCount} total, first ${focus.available.length} listed):`)
  lines.push(focus.available.map((p) => `${p.name}${p.priorTeam ? ` (${p.priorTeam})` : ''}`).join(', '))
  lines.push(
    'That list is the panel\'s current pool only. Use the get_free_agents tool for the full pool, Bird-rights status, or prior-team filters.'
  )

  return lines.join('\n')
}
