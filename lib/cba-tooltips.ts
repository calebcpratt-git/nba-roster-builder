import type { TooltipContent } from '@/components/desktop/spec-tooltip'
import { formatCurrency } from './data'

// The CBA explanations behind the desktop chips and help icons. Kept out of the
// components so the wording is edited in one place — several of these are
// restatements of rules the validator enforces, and they drift into being wrong
// if they live next to the markup that happens to show them.

export function rosterSpotsTooltip(statusLabel: string): TooltipContent {
  return {
    title: `Standard roster spots — ${statusLabel}`,
    lines: [
      { text: 'A team carries at most 15 players on standard contracts, must be at 14 or more during the season, and can never go below 12.' },
      { text: 'The count here includes the current roster plus free agents and extensions signed in this builder and any incoming trade players.' },
    ],
    footer: 'A hardship exception lifts the 15-man ceiling. Players whose option is declined mid-contract are not yet accounted for.',
  }
}

export const HARDSHIP_TOOLTIP: TooltipContent = {
  title: 'Hardship exception',
  lines: [
    { text: 'Granted when injuries drop a team below the minimum number of available players. It allows carrying more than 15 and signing extra 10-day contracts.' },
  ],
  footer: "Manual toggle — this app doesn't track a real transaction calendar or injury designations.",
}

export const PLAYOFF_LOCK_TOOLTIP: TooltipContent = {
  title: 'Post-March 1 playoff lock',
  lines: [
    { text: 'After March 1, only players already on standard contracts are playoff-eligible. Turning this on flags two-way players and unconverted 10-days.' },
  ],
  footer: "Manual toggle — this app doesn't track a real transaction calendar.",
}

export const SALARY_MATCHING_TOOLTIP: TooltipContent = {
  title: 'Salary matching by apron level',
  lines: [
    { label: 'Below the first apron:', text: 'the expanded traded-player exception applies — a bracketed sliding scale that lets you take back more than you send.' },
    { label: 'At/above the first apron:', text: 'dollar-for-dollar only. No sign-and-trade acquisitions, no non-taxpayer MLE or bi-annual exception, and no trade exceptions generated before the prior deadline.' },
    { label: 'At/above the second apron:', text: 'dollar-for-dollar, no aggregating two or more salaries in one deal, and no sending cash.' },
  ],
  footer: 'Derived from Apron Salary. Hard-cap status is tracked separately — a team can be hard-capped at an apron it is not currently over.',
}

const EXCEPTION_BLURBS: Record<string, string> = {
  'room-mle': 'The room exception is the mid-level available to a team that used cap space. It only exists once a team is under the cap.',
  'non-taxpayer-mle': 'The full mid-level exception, available to teams over the cap but below the first apron. Using it hard-caps the team at the first apron.',
  'bi-annual': 'A smaller exception usable in alternating years by teams over the cap but below the first apron. Using it hard-caps the team at the first apron.',
  'taxpayer-mle': 'The reduced mid-level for teams between the first and second apron. Using it hard-caps the team at the second apron.',
  'disabled-player': 'Replaces a player lost for the season, at half his salary or the non-taxpayer mid-level, whichever is less. Unavailable above the second apron.',
}

const EXCEPTION_UNAVAILABLE_REASONS: Record<string, string> = {
  'room-mle': 'Unavailable because this team has no cap room — a team over the cap uses a mid-level exception instead.',
  'non-taxpayer-mle': 'Unavailable at this apron level: this tier is only for teams over the cap and below the first apron.',
  'bi-annual': 'Unavailable at this apron level: the bi-annual exception requires being over the cap and below the first apron.',
  'taxpayer-mle': 'Unavailable at this apron level: this tier only applies between the first and second apron.',
  'disabled-player': 'Unavailable: a team at or above the second apron cannot use the disabled player exception.',
}

export function exceptionTooltip(
  key: string,
  label: string,
  eligible: boolean,
  alreadyUsed: boolean
): TooltipContent {
  const statusWord = alreadyUsed ? 'Already Used' : eligible ? 'Available' : 'Unavailable'
  const footer = alreadyUsed
    ? 'Already spent this offseason — a team gets one allocation per season.'
    : eligible
      ? key === 'disabled-player'
        ? 'Nothing has been spent against it, but this row reflects apron eligibility only — a grant also requires a qualifying injury and a physician’s designation.'
        : 'Nothing has been spent against it yet this offseason.'
      : EXCEPTION_UNAVAILABLE_REASONS[key]

  return {
    title: `${label} — ${statusWord}`,
    lines: [{ text: EXCEPTION_BLURBS[key] ?? '' }],
    footer,
  }
}

export function cashOutTooltip(amount: number, restricted: boolean): TooltipContent {
  return {
    title: 'Cash you can still send',
    lines: [
      restricted
        ? { text: 'A team at or above the second apron cannot send cash in a trade at all.' }
        : { text: `${formatCurrency(amount)} of this season's cash allowance is still available to send. Cash never changes either team's Team Salary.` },
    ],
    footer: 'Second-apron teams cannot send cash at all. The allowance resets each season and does not carry over.',
  }
}

export function cashInTooltip(amount: number): TooltipContent {
  return {
    title: 'Cash you can still receive',
    lines: [
      { text: `${formatCurrency(amount)} can still be received this season. Receiving is tracked separately from sending — the two do not offset — and neither counts toward Team Salary.` },
    ],
    footer: 'Resets each season, with no carryover.',
  }
}

export function tpeTooltip(
  amount: number,
  fromPlayer: string | undefined,
  expires: string,
  daysLeft: number,
  locked: boolean
): TooltipContent {
  return {
    title: `${formatCurrency(amount)} trade exception${locked ? ' — Locked' : ''}`,
    lines: [
      { text: fromPlayer ? `Generated by trading away ${fromPlayer}.` : 'Generated by a prior trade.' },
      {
        text: `Expires ${new Date(expires).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining.`,
      },
    ],
    footer: locked
      ? 'Generated before the prior trade deadline, so it cannot be used while this team is above the first apron. Lock dates are approximated from the exception’s one-year expiration, not sourced deadline data.'
      : undefined,
  }
}

export function apronTooltip(statusLabel: string, matchRule: string): TooltipContent {
  return {
    title: `${statusLabel} · ${matchRule}`,
    lines: SALARY_MATCHING_TOOLTIP.lines,
    footer: SALARY_MATCHING_TOOLTIP.footer,
  }
}
