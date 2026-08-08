'use client'

import { useRoster } from '@/lib/roster-context'
import { CAP_THRESHOLDS } from '@/lib/data'
import { ExceptionsUsed, TEAM_CAP_STATE } from '@/lib/team-cap-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, X } from 'lucide-react'
import { SavedContract, Season, SEASONS } from '@/lib/types'

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

export function SigningExceptionsPanel() {
  const { selectedTeamAbbr, getTeamCapTotal, savedContracts, deletedContractIds } = useRoster()
  const { capSpaceTotal, apronTotal } = getTeamCapTotal(selectedTeamAbbr, SEASON)

  const exceptionsUsed = TEAM_CAP_STATE[selectedTeamAbbr]?.[SEASON]?.exceptionsUsed
  const usedExceptions = getUsedExceptions(exceptionsUsed, savedContracts, deletedContractIds, SEASON)
  const dpeUsed = exceptionsUsed?.dpe?.used ?? false
  const mechanisms = getSigningExceptions(SEASON, capSpaceTotal, apronTotal, usedExceptions, dpeUsed)

  return (
    <Card className="border border-border rounded-lg overflow-hidden shadow-none py-0 gap-0">
      <CardHeader className="py-2.5 px-3.5 gap-0 bg-accent">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[12.5px] font-semibold">Signing Exceptions (26-27)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-3.5 py-3">
        <div className="grid grid-cols-1 gap-1.5">
          {mechanisms.map((mechanism) => {
            const available = mechanism.eligible && !mechanism.alreadyUsed
            return (
              <div key={mechanism.key} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{mechanism.label}</span>
                {available ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
                    <Check className="h-3.5 w-3.5" />
                    Available
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <X className="h-3.5 w-3.5" />
                    {mechanism.alreadyUsed ? 'Already Used' : 'Unavailable'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[10.5px] text-muted-foreground mt-2.5 pt-2.5 border-t border-border">
          Already-used status is sourced directly from SalarySwish&apos;s per-team exception trackers. A team only
          gets a Disabled Player Exception grant if it has a qualifying player and physician&apos;s designation —
          absent a known grant, that row reflects apron eligibility only.
        </p>
      </CardContent>
    </Card>
  )
}
