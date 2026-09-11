import { CAP_THRESHOLDS } from './data'
import { ExceptionsUsed } from './team-cap-state'
import { SavedContract, Season, SEASONS } from './types'

const SEASON: Season = '2026-27'

export type TrackedException = 'room-mle' | 'non-taxpayer-mle' | 'taxpayer-mle' | 'bi-annual'

interface Mechanism {
  key: TrackedException | 'disabled-player'
  label: string
  eligible: boolean
  alreadyUsed: boolean
}

function firstFundedSeason(salary: Partial<Record<Season, number>>): Season | undefined {
  return SEASONS.find((s) => (salary[s] ?? 0) > 0)
}

const EXCEPTION_TYPE_TO_TRACKED: Record<NonNullable<SavedContract['exceptionType']>, TrackedException> = {
  ntmle: 'non-taxpayer-mle',
  tmle: 'taxpayer-mle',
  bae: 'bi-annual',
}

// Sourced straight from TEAM_CAP_STATE[team][season].exceptionsUsed — SalarySwish's
// own live-computed per-team tracker, not an app-side re-derivation from roster
// contracts' signedUnder tags (that join was replaced once the pipeline started
// pulling the authoritative field directly; see the comment on ExceptionsUsed in
// lib/team-cap-state.ts). Covers all 30 teams, so this is accurate for whichever
// team is selected, not just a heuristic for the currently-loaded roster.
export function getUsedExceptions(
  exceptionsUsed: ExceptionsUsed | undefined,
  savedContracts: SavedContract[],
  deletedContractIds: Set<string>,
  season: Season
): Set<TrackedException> {
  const used = new Set<TrackedException>()

  if ((exceptionsUsed?.nonTaxpayerMLE?.signings.length ?? 0) > 0) used.add('non-taxpayer-mle')
  if ((exceptionsUsed?.taxpayerMLE?.signings.length ?? 0) > 0) used.add('taxpayer-mle')
  if ((exceptionsUsed?.roomMLE?.signings.length ?? 0) > 0) used.add('room-mle')
  if ((exceptionsUsed?.biAnnual?.signings.length ?? 0) > 0) used.add('bi-annual')

  // A contract signed live in this builder session isn't reflected in the
  // scraped exceptionsUsed snapshot yet, so it's layered on top, keyed off
  // which exception the free-agent modal tagged the contract with.
  savedContracts.forEach((contract) => {
    if (deletedContractIds.has(contract.id)) return
    if (contract.type !== 'free-agent' || !contract.exceptionType) return
    if (firstFundedSeason(contract.salary) !== season) return
    used.add(EXCEPTION_TYPE_TO_TRACKED[contract.exceptionType])
  })

  return used
}

export function getSigningExceptions(
  season: Season,
  capSpaceTotal: number,
  apronTotal: number,
  usedExceptions: Set<TrackedException>,
  dpeUsed: boolean
): Mechanism[] {
  const thresholds = CAP_THRESHOLDS[season]
  const softCap = thresholds.find((t) => t.type === 'soft-cap')?.value ?? 0
  const firstApron = thresholds.find((t) => t.type === 'first-apron')?.value ?? 0
  const secondApron = thresholds.find((t) => t.type === 'second-apron')?.value ?? 0

  const hasCapRoom = capSpaceTotal < softCap
  const belowFirstApron = apronTotal < firstApron
  const belowSecondApron = apronTotal < secondApron

  // Non-Taxpayer and Taxpayer MLE aren't two separate pools — a team gets one
  // mid-level allocation per season, and which tier it comes in depends on
  // apron status at the moment it's used. Once spent, it's spent regardless
  // of tier, so both rows share a single "used" flag rather than each
  // checking only its own tag (a team's apron position can shift after the
  // tagged signing — via releases, trades, or more contracts added in the
  // builder — which would otherwise make the *other* tier look untouched).
  const mleUsed = usedExceptions.has('non-taxpayer-mle') || usedExceptions.has('taxpayer-mle')

  return [
    { key: 'room-mle', label: 'Room Exception', eligible: hasCapRoom, alreadyUsed: usedExceptions.has('room-mle') },
    {
      key: 'non-taxpayer-mle',
      label: 'Non-Taxpayer MLE',
      eligible: !hasCapRoom && belowFirstApron,
      alreadyUsed: mleUsed,
    },
    {
      key: 'bi-annual',
      label: 'Bi-Annual Exception',
      eligible: !hasCapRoom && belowFirstApron,
      alreadyUsed: usedExceptions.has('bi-annual'),
    },
    {
      key: 'taxpayer-mle',
      label: 'Taxpayer MLE',
      eligible: !belowFirstApron && belowSecondApron,
      alreadyUsed: mleUsed,
    },
    {
      key: 'disabled-player',
      label: 'Disabled Player Exception',
      eligible: belowSecondApron,
      alreadyUsed: dpeUsed,
    },
  ]
}
