import { useMemo } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season } from '@/lib/types'
import { CAP_THRESHOLDS, getCapSpaceStatus, getApronStatus } from '@/lib/data'
import { getDisplayedSeasons } from '@/lib/contract-utils'
import { getTeamCapState } from '@/lib/team-cap-state'

// Shared row/season derivation used by both the desktop and mobile roster
// tables, so cap-total math and roster composition can't drift between them.
export function useRosterTableData() {
  const {
    roster,
    savedContracts,
    getEffectiveSalary,
    getTotalSalary,
    deletedContractIds,
    draftPickPlayers,
    savedTrades,
    tradedRosterPlayerIds,
    selectedTeamAbbr,
  } = useRoster()

  const displayedSeasons = useMemo(
    () => getDisplayedSeasons(roster, savedContracts, deletedContractIds, draftPickPlayers, savedTrades),
    [roster, savedContracts, deletedContractIds, draftPickPlayers, savedTrades]
  )

  const allPlayers = useMemo(() => [
    ...roster.map((p) => {
      // Use extension salary for 26-27 if one exists (covers new signings and declined-option re-signs),
      // otherwise fall back to effective salary (returns 0 for declined options).
      const extension = savedContracts.find(
        c => c.type === 'extension' && c.playerId === p.id && !deletedContractIds.has(c.id)
      )
      const sortSalary = extension?.salary['2026-27'] || getEffectiveSalary(p, '2026-27')
      return { ...p, source: 'current' as const, sortSalary, isTraded: tradedRosterPlayerIds.has(p.id), rfaPath: extension?.rfaPath }
    }),
    ...savedContracts
      .filter((c) => c.type === 'free-agent')
      .map((c) => {
        const firstYearSalary = SEASONS.reduce<number>((first, season) => {
          if (first === 0 && c.salary[season]) return c.salary[season]!
          return first
        }, 0)
        return {
          id: c.id,
          name: c.playerName,
          team: '',
          salary: c.salary,
          options: {} as Partial<Record<Season, 'Player' | 'Team'>>,
          isUserCreated: true,
          source: 'saved' as const,
          type: c.type,
          contractType: c.contractType,
          sortSalary: firstYearSalary,
          isMinimum: c.isMinimum || false,
          isTraded: tradedRosterPlayerIds.has(c.id),
          isDeleted: deletedContractIds.has(c.id),
          rfaPath: c.rfaPath,
        }
      }),
    // Incoming trade players
    ...savedTrades.flatMap((trade) =>
      trade.incomingPlayers.map((p) => {
        const firstYearSalary = SEASONS.reduce<number>((first, season) => {
          if (first === 0 && p.salary[season]) return p.salary[season]!
          return first
        }, 0)
        return {
          id: `${trade.id}-player-${p.playerId}`,
          name: p.playerName,
          team: trade.tradeTeamAbbr,
          salary: p.salary,
          options: p.options,
          isUserCreated: true,
          source: 'trade-incoming' as const,
          type: 'trade' as const,
          sortSalary: firstYearSalary,
          isMinimum: false,
          isTraded: false,
        }
      })
    ),
  ].sort((a, b) => b.sortSalary - a.sortSalary), [roster, savedContracts, deletedContractIds, savedTrades, tradedRosterPlayerIds, getEffectiveSalary])

  const projections = useMemo(() => displayedSeasons.map((season) => {
    const { current, saved, capSpaceTotal, apronTotal } = getTotalSalary(season)
    const thresholds = CAP_THRESHOLDS[season]
    const capSpaceStatus = getCapSpaceStatus(capSpaceTotal, thresholds)
    const apronStatus = getApronStatus(apronTotal, thresholds)

    return {
      season,
      current,
      saved,
      // capSpaceTotal/status kept as total/status too, for callers (trade
      // modal previews, cap-sheet summaries) that only care about one number.
      total: capSpaceTotal,
      status: capSpaceStatus,
      capSpaceTotal,
      capSpaceStatus,
      apronTotal,
      apronStatus,
      thresholds,
    }
  }), [displayedSeasons, getTotalSalary])

  // Hard-cap status is a separate fact from apron status — a team can be over
  // an apron without being hard-capped there, or vice versa (e.g. a July
  // sign-and-trade hard-caps at the first apron for the season regardless of
  // where Apron Team Salary later lands). Only present for the current season.
  const hardCapped = useMemo(
    () => getTeamCapState(selectedTeamAbbr, SEASONS[0])?.hardCapped,
    [selectedTeamAbbr]
  )

  return { displayedSeasons, allPlayers, projections, hardCapped }
}
