'use client'

import { useMemo } from 'react'
import { useRoster } from '@/lib/roster-context'
import { incomingPlayersFor } from '@/lib/trade-model'
import { SEASONS, Season } from '@/lib/types'

const SEASON: Season = SEASONS[0]

export const TWO_WAY_SLOTS = 3
export const STANDARD_FLOOR = 12
export const STANDARD_MINIMUM = 14
export const STANDARD_MAXIMUM = 15

export type ComplianceTone = 'red' | 'amber' | 'green'

export interface TwoWayEntry {
  id: string
  playerName: string
}

/**
 * The 2023 CBA's roster-count rules as this app models them, for the current
 * season only. Shared by the desktop compliance strip and its tooltip so the
 * count and the explanation can't disagree.
 *
 * `hardship` is the caller's toggle rather than sourced state — the app has no
 * transaction calendar, so whether a team actually holds a hardship exception
 * is something the user asserts.
 */
export function useRosterCompliance(hardship: boolean) {
  const {
    roster,
    savedContracts,
    normalizedTrades,
    selectedTeamAbbr,
    deletedContractIds,
    releasedRosterIds,
    tradedRosterPlayerIds,
    getEffectiveSalary,
  } = useRoster()

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

  const incomingTradePlayers = useMemo(
    () => normalizedTrades.flatMap((t) => incomingPlayersFor(t, selectedTeamAbbr)),
    [normalizedTrades, selectedTeamAbbr]
  )

  const twoWaySignings = activeContracts.filter((c) => c.contractType === 'two-way')
  const standardSignings = activeContracts.filter((c) => c.contractType !== 'two-way')

  const twoWayEntries: TwoWayEntry[] = [
    ...twoWayRosterPlayers.map((p) => ({ id: p.id, playerName: p.name })),
    ...twoWaySignings.map((c) => ({ id: c.id, playerName: c.playerName })),
  ]

  const standardCount = standardRosterPlayers.length + standardSignings.length + incomingTradePlayers.length
  const twoWayCount = twoWayEntries.length

  const belowFloor = standardCount < STANDARD_FLOOR
  const belowMinimum = !belowFloor && standardCount < STANDARD_MINIMUM
  const aboveMaximum = standardCount > STANDARD_MAXIMUM && !hardship

  const status: { label: string; tone: ComplianceTone } = belowFloor
    ? { label: 'Below 12-player floor', tone: 'red' }
    : belowMinimum
      ? { label: 'Below 14-player minimum', tone: 'amber' }
      : aboveMaximum
        ? { label: 'Above 15-player max — needs hardship', tone: 'amber' }
        : { label: 'Compliant', tone: 'green' }

  return {
    season: SEASON,
    standardCount,
    twoWayCount,
    twoWayEntries,
    twoWayOverLimit: twoWayCount > TWO_WAY_SLOTS,
    belowFloor,
    belowMinimum,
    aboveMaximum,
    status,
    /** Non-compliant in any direction — drives the amber numeral in the strip. */
    standardWarn: belowFloor || belowMinimum || aboveMaximum,
  }
}
