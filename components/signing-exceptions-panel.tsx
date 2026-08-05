'use client'

import { useRoster } from '@/lib/roster-context'
import { CAP_THRESHOLDS } from '@/lib/data'
import { getContractDetail } from '@/lib/contract-details'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, X } from 'lucide-react'
import { Player, SavedContract, Season, SEASONS } from '@/lib/types'

const SEASON: Season = '2026-27'

// The four exceptions the data pipeline can actually tag a contract with
// (see ContractDetail['signedUnder'] in lib/contract-details.ts). The
// Disabled Player Exception isn't among them — it's granted per-player via a
// medical review, not tracked as a season-long team resource in this data,
// so its row can only reflect apron eligibility, not "already used."
type TrackedException = 'room-mle' | 'non-taxpayer-mle' | 'taxpayer-mle' | 'bi-annual'

interface Mechanism {
  key: TrackedException | 'disabled-player'
  label: string
  eligible: boolean
  alreadyUsed: boolean
}

function firstFundedSeason(salary: Partial<Record<Season, number>>): Season | undefined {
  return SEASONS.find((s) => (salary[s] ?? 0) > 0)
}

// A team's exception is spent for the season either by an existing roster
// contract the pipeline tagged with that exception (signed this off-season,
// i.e. its own first funded season is the season in question), or by a
// contract signed live in this builder. The free-agent modal's MLE checkbox
// only ever grants the Non-Taxpayer MLE (it's disabled once a team is at or
// above the first apron), so an isMLE saved contract always maps to that one.
function getUsedExceptions(
  roster: Player[],
  savedContracts: SavedContract[],
  deletedContractIds: Set<string>,
  excludedRosterIds: Set<string>,
  season: Season
): Set<TrackedException> {
  const used = new Set<TrackedException>()
  const trackedTypes: TrackedException[] = ['room-mle', 'non-taxpayer-mle', 'taxpayer-mle', 'bi-annual']

  roster.forEach((player) => {
    if (excludedRosterIds.has(player.id)) return
    if (firstFundedSeason(player.salary) !== season) return
    const signedUnder = getContractDetail(player.name)?.signedUnder
    if (signedUnder && (trackedTypes as string[]).includes(signedUnder)) {
      used.add(signedUnder as TrackedException)
    }
  })

  savedContracts.forEach((contract) => {
    if (deletedContractIds.has(contract.id)) return
    if (contract.type !== 'free-agent' || !contract.isMLE) return
    if (firstFundedSeason(contract.salary) !== season) return
    used.add('non-taxpayer-mle')
  })

  return used
}

export function getSigningExceptions(
  capSpaceTotal: number,
  apronTotal: number,
  usedExceptions: Set<TrackedException>
): Mechanism[] {
  const thresholds = CAP_THRESHOLDS[SEASON]
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
    { key: 'disabled-player', label: 'Disabled Player Exception', eligible: belowSecondApron, alreadyUsed: false },
  ]
}

export function SigningExceptionsPanel() {
  const {
    selectedTeamAbbr,
    getTeamCapTotal,
    roster,
    savedContracts,
    deletedContractIds,
    releasedRosterIds,
    tradedRosterPlayerIds,
  } = useRoster()
  const { capSpaceTotal, apronTotal } = getTeamCapTotal(selectedTeamAbbr, SEASON)

  const excludedRosterIds = new Set([...releasedRosterIds, ...tradedRosterPlayerIds])
  const usedExceptions = getUsedExceptions(roster, savedContracts, deletedContractIds, excludedRosterIds, SEASON)
  const mechanisms = getSigningExceptions(capSpaceTotal, apronTotal, usedExceptions)

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
                    {mechanism.eligible && mechanism.alreadyUsed ? 'Already Used' : 'Unavailable'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[10.5px] text-muted-foreground mt-2.5 pt-2.5 border-t border-border">
          The Disabled Player Exception also requires a qualifying player and a physician&apos;s designation, which
          isn&apos;t modeled here — its row reflects apron eligibility only.
        </p>
      </CardContent>
    </Card>
  )
}
