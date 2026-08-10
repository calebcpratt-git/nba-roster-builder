'use client'

import { useMemo, useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const SEASON: Season = SEASONS[0]
const TWO_WAY_SLOTS = 3
const STANDARD_FLOOR = 12
const STANDARD_MINIMUM = 14
const STANDARD_MAXIMUM = 15

export function RosterCompliancePanel() {
  const {
    roster,
    savedContracts,
    savedTrades,
    deletedContractIds,
    releasedRosterIds,
    tradedRosterPlayerIds,
    getEffectiveSalary,
  } = useRoster()

  const [hardshipActive, setHardshipActive] = useState(false)
  const [playoffLockActive, setPlayoffLockActive] = useState(false)

  const activeContracts = useMemo(
    () =>
      savedContracts.filter(
        (c) => !deletedContractIds.has(c.id) && !tradedRosterPlayerIds.has(c.id) && (c.salary[SEASON] ?? 0) > 0
      ),
    [savedContracts, deletedContractIds, tradedRosterPlayerIds]
  )

  const standardRosterPlayers = useMemo(
    () =>
      roster.filter(
        (p) => !releasedRosterIds.has(p.id) && !tradedRosterPlayerIds.has(p.id) && getEffectiveSalary(p, SEASON) > 0
      ),
    [roster, releasedRosterIds, tradedRosterPlayerIds, getEffectiveSalary]
  )

  // Real two-way players sourced onto the roster from data (contractType is
  // stamped by scripts/scrape/run.py::build_two_way_contracts) already fall
  // out of standardRosterPlayers above, since getEffectiveSalary treats them
  // as $0 — but they still need to actually count toward the 3-slot limit,
  // not just be silently excluded from the standard count.
  const twoWayRosterPlayers = useMemo(
    () =>
      roster.filter(
        (p) => !releasedRosterIds.has(p.id) && !tradedRosterPlayerIds.has(p.id) && p.contractType === 'two-way'
      ),
    [roster, releasedRosterIds, tradedRosterPlayerIds]
  )

  const twoWaySignings = activeContracts.filter((c) => c.contractType === 'two-way')
  const standardSignings = activeContracts.filter((c) => c.contractType !== 'two-way')
  const incomingTradePlayers = useMemo(() => savedTrades.flatMap((t) => t.incomingPlayers), [savedTrades])

  const twoWayEntries = [
    ...twoWayRosterPlayers.map((p) => ({ id: p.id, playerName: p.name })),
    ...twoWaySignings.map((c) => ({ id: c.id, playerName: c.playerName })),
  ]

  const standardCount = standardRosterPlayers.length + standardSignings.length + incomingTradePlayers.length
  const twoWayCount = twoWayEntries.length

  const belowFloor = standardCount < STANDARD_FLOOR
  const belowMinimum = !belowFloor && standardCount < STANDARD_MINIMUM
  const aboveMaximum = standardCount > STANDARD_MAXIMUM && !hardshipActive
  const twoWayOverLimit = twoWayCount > TWO_WAY_SLOTS

  const rosterStatus = belowFloor
    ? { label: 'Below 12-player floor', tone: 'red' as const }
    : belowMinimum
    ? { label: 'Below 14-player minimum', tone: 'amber' as const }
    : aboveMaximum
    ? { label: 'Above 15-player max — needs hardship', tone: 'amber' as const }
    : { label: 'Compliant', tone: 'green' as const }

  const playoffIneligible = playoffLockActive ? twoWayEntries : []

  return (
    <Card className="border border-border rounded-lg overflow-hidden shadow-none py-0 gap-0">
      <CardHeader className="py-2.5 px-3.5 gap-0 bg-accent">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[12.5px] font-semibold">Roster & Eligibility ({SEASON})</CardTitle>
          <StatusBadge tone={rosterStatus.tone} label={rosterStatus.label} />
        </div>
      </CardHeader>
      <CardContent className="px-3.5 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Standard Contracts"
            value={`${standardCount}`}
            sub={`14–15 min/max${hardshipActive ? ' (hardship active)' : ''}`}
            warn={belowFloor || belowMinimum || aboveMaximum}
          />
          <StatTile
            label="Two-Way Slots"
            value={`${twoWayCount}/${TWO_WAY_SLOTS}`}
            sub="Excluded from Team Salary"
            warn={twoWayOverLimit}
          />
        </div>

        {twoWayEntries.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide">Two-Way Roster</p>
            {twoWayEntries.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span>{c.playerName}</span>
                <Badge variant="outline" className="text-[10px] font-normal text-sky-600 border-sky-600/30">
                  Two-Way
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <Label htmlFor="hardship-toggle" className="text-xs font-medium cursor-pointer">
              Hardship Exception Active
            </Label>
            <p className="text-[10.5px] text-muted-foreground">Allows the roster above 15 and unlocks extra 10-days.</p>
          </div>
          <Switch id="hardship-toggle" checked={hardshipActive} onCheckedChange={setHardshipActive} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <Label htmlFor="playoff-lock-toggle" className="text-xs font-medium cursor-pointer">
              Post-March 1 (Playoff Lock)
            </Label>
            <p className="text-[10.5px] text-muted-foreground">Flags anyone not playoff-eligible on the current roster.</p>
          </div>
          <Switch id="playoff-lock-toggle" checked={playoffLockActive} onCheckedChange={setPlayoffLockActive} />
        </div>

        {playoffIneligible.length > 0 && (
          <div className="space-y-1 bg-amber-500/10 rounded p-2">
            <p className="text-[10.5px] font-medium text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Not playoff-eligible
            </p>
            {playoffIneligible.map((c) => (
              <p key={c.id} className="text-xs text-muted-foreground">
                {c.playerName} — still on a two-way contract
              </p>
            ))}
          </div>
        )}

        <p className="text-[10.5px] text-muted-foreground pt-2 border-t border-border">
          Standard-contract count includes the current roster, saved free-agent/extension signings, and incoming
          trade players; it does not yet account for players whose option was declined mid-contract. Hardship and
          playoff-lock are manual toggles — this app doesn&apos;t track a real transaction calendar.
        </p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ tone, label }: { tone: 'red' | 'amber' | 'green'; label: string }) {
  const toneClasses = {
    red: 'text-red-600 bg-red-500/10',
    amber: 'text-amber-600 bg-amber-500/10',
    green: 'text-emerald-600 bg-emerald-500/10',
  }[tone]

  return (
    <span className={cn('flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded', toneClasses)}>
      {tone === 'green' ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  )
}

function StatTile({ label, value, sub, warn }: { label: string; value: string; sub: string; warn: boolean }) {
  return (
    <div className="rounded border border-border p-2">
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold font-mono tabular-nums', warn && 'text-amber-600')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  )
}
