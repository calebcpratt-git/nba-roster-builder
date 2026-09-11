'use client'

// Snapshots the builder state the user is actually looking at into the
// GmChatContext the assistant is given on every turn. This is the whole point
// of the feature: without it the model can only talk about the scraped league
// data, not about the sheet the user has been editing (their signings, trades,
// option calls and releases, and the cap totals those produce).
//
// League-wide facts are intentionally excluded — those come from the tools in
// lib/gm-chat/tools.ts, so this payload stays small enough to resend each turn.

import { useMemo } from 'react'
import { useRoster } from '../roster-context'
import { CAP_THRESHOLDS, getApronStatus } from '../data'
import { getDisplayedSeasons } from '../contract-utils'
import { getTeamCapState, TEAM_CAP_STATE } from '../team-cap-state'
import { getSigningExceptions, getUsedExceptions } from '../signing-exceptions'
import { getHeldTPEView } from '../trade-exceptions'
import { getPicksByTeamAbbr } from '../draft-picks'
import { SEASONS, type Season } from '../types'
import type {
  GmChatContext,
  GmChatPendingMoves,
  GmChatRosterRow,
  GmChatSeasonDetail,
  GmChatSeasonLine,
} from './types'

function thresholdsFor(season: Season) {
  const rows = CAP_THRESHOLDS[season]
  const value = (type: string) => rows.find((t) => t.type === type)?.value ?? 0
  return {
    softCap: value('soft-cap'),
    salaryFloor: value('salary-floor'),
    luxuryTax: value('luxury-tax'),
    firstApron: value('first-apron'),
    secondApron: value('second-apron'),
  }
}

export function useGmChatContext(): GmChatContext {
  const {
    selectedTeamAbbr,
    selectedTeam,
    roster,
    savedContracts,
    deletedContractIds,
    normalizedTrades,
    draftPickPlayers,
    releasedRosterIds,
    releaseDetails,
    tradedRosterPlayerIds,
    renouncedCapHolds,
    hasUnsavedChanges,
    activeCapSheet,
    getEffectiveSalary,
    isOptionExercised,
    getTotalSalary,
    getUnresolvedCapHolds,
    getReleaseDeadMoney,
  } = useRoster()

  // Everything below is derived, so it only needs to be rebuilt when the sheet
  // changes — the chat panel re-renders on every keystroke otherwise.
  return useMemo(() => {
    const activeContracts = savedContracts.filter((c) => !deletedContractIds.has(c.id))
    const displayedSeasons = getDisplayedSeasons(
      roster,
      activeContracts,
      deletedContractIds,
      draftPickPlayers,
      normalizedTrades,
      selectedTeamAbbr
    )
    const seasonList = displayedSeasons.length > 0 ? displayedSeasons : [SEASONS[0]]
    const firstSeason = seasonList[0]

    const seasons: GmChatSeasonLine[] = seasonList.map((season) => {
      const { capSpaceTotal, apronTotal } = getTotalSalary(season)
      const t = thresholdsFor(season)
      return {
        season,
        capSpaceTotal,
        apronTotal,
        apronStatus: getApronStatus(apronTotal, CAP_THRESHOLDS[season]),
        ...t,
        capSpace: t.softCap - capSpaceTotal,
        underTax: t.luxuryTax - apronTotal,
        underFirstApron: t.firstApron - apronTotal,
        underSecondApron: t.secondApron - apronTotal,
      }
    })

    const tradeDestination = new Map<string, string>()
    normalizedTrades.forEach((trade) => {
      trade.movements.forEach((m) => {
        if (m.kind === 'player' && m.from === selectedTeamAbbr) tradeDestination.set(m.id, m.to)
      })
    })

    const rosterRows: GmChatRosterRow[] = roster.map((player) => {
      const salary: Partial<Record<Season, number>> = {}
      seasonList.forEach((season) => {
        const amount = getEffectiveSalary(player, season)
        if (amount > 0) salary[season] = amount
      })

      const options: GmChatRosterRow['options'] = []
      SEASONS.forEach((season) => {
        const type = player.options[season]
        if (!type) return
        const exercised = isOptionExercised(player.id, season, type)
        options.push({
          season,
          type,
          decision: exercised === null ? 'undecided' : exercised ? 'exercised' : 'declined',
        })
      })

      const release = releaseDetails[player.id]
      return {
        name: player.name,
        salary,
        options,
        guarantees: player.guarantees,
        contractType: player.contractType,
        releasedOn: releasedRosterIds.has(player.id) && release ? release : undefined,
        tradedTo: tradedRosterPlayerIds.has(player.id) ? tradeDestination.get(player.id) : undefined,
      }
    })

    const pendingMoves: GmChatPendingMoves = {
      signings: activeContracts.map((c) => ({
        player: c.playerName,
        kind: c.type,
        salary: c.salary,
        exceptionType: c.exceptionType,
        isMinimum: c.isMinimum,
        isMaxContract: c.isMaxContract,
        contractType: c.contractType,
        rfaPath: c.rfaPath,
      })),
      trades: normalizedTrades.map((trade) => ({
        teams: trade.teams,
        isSignAndTrade: trade.isSignAndTrade,
        legs: trade.movements.map((m) =>
          m.kind === 'cash'
            ? `$${(m.amount ?? 0).toLocaleString()} cash ${m.from} to ${m.to}`
            : `${m.name ?? m.id} ${m.from} to ${m.to}`
        ),
      })),
      optionDecisions: rosterRows.flatMap((row) =>
        row.options
          .filter((o) => o.decision !== 'undecided')
          .map((o) => ({
            player: row.name,
            season: o.season,
            type: o.type,
            decision: o.decision as 'exercised' | 'declined',
          }))
      ),
      releases: roster
        .filter((p) => releasedRosterIds.has(p.id))
        .map((p) => ({
          player: p.name,
          date: releaseDetails[p.id]?.date ?? '',
          claimed: releaseDetails[p.id]?.claimed ?? false,
        })),
      // Keys are `${teamAbbr}-${season}-${holdLabel}`; only this team's matter.
      renouncedCapHolds: Array.from(renouncedCapHolds)
        .filter((key) => key.startsWith(`${selectedTeamAbbr}-`))
        .map((key) => key.slice(`${selectedTeamAbbr}-`.length)),
    }

    const capState = getTeamCapState(selectedTeamAbbr, firstSeason)
    const exceptionsUsed = TEAM_CAP_STATE[selectedTeamAbbr]?.[firstSeason]?.exceptionsUsed
    const { capSpaceTotal, apronTotal } = getTotalSalary(firstSeason)
    const overFirstApron = apronTotal >= thresholdsFor(firstSeason).firstApron

    const seasonDetail: GmChatSeasonDetail = {
      season: firstSeason,
      capHolds: getUnresolvedCapHolds(selectedTeamAbbr, firstSeason),
      deadMoney: capState?.deadMoney ?? [],
      releaseDeadMoney: getReleaseDeadMoney(selectedTeamAbbr, firstSeason),
      signingExceptions: getSigningExceptions(
        firstSeason,
        capSpaceTotal,
        apronTotal,
        getUsedExceptions(exceptionsUsed, savedContracts, deletedContractIds, firstSeason),
        exceptionsUsed?.dpe?.used ?? false
      ).map(({ label, eligible, alreadyUsed }) => ({ label, eligible, alreadyUsed })),
      tradeExceptions: getHeldTPEView(selectedTeamAbbr, firstSeason, overFirstApron).map((tpe) => ({
        amount: tpe.amount,
        expires: tpe.expires,
        daysLeft: tpe.daysLeft,
        locked: tpe.locked,
        fromPlayer: tpe.fromPlayer,
      })),
      hardCapped: capState?.hardCapped,
      cash: capState?.cashLedger,
    }

    return {
      team: { abbr: selectedTeamAbbr, name: selectedTeam.name, city: selectedTeam.city },
      seasons,
      roster: rosterRows,
      incomingDraftPicks: draftPickPlayers.map((p) => {
        const salary: Partial<Record<Season, number>> = {}
        seasonList.forEach((season) => {
          if (p.salary[season]) salary[season] = p.salary[season]!
        })
        return { name: p.name, salary }
      }),
      ownedPicks: getPicksByTeamAbbr(selectedTeamAbbr).map((pick) => ({
        year: pick.year,
        round: pick.round,
        via: pick.teamFrom ?? undefined,
        protections: pick.protections ?? undefined,
        swap: pick.swapOption ?? undefined,
        frozen: pick.frozen,
      })),
      pendingMoves,
      seasonDetail,
      sheet: {
        name: activeCapSheet?.name ?? null,
        unsavedChanges: hasUnsavedChanges,
        rosterCount: roster.filter((p) => !releasedRosterIds.has(p.id) && !tradedRosterPlayerIds.has(p.id)).length,
        moveCount:
          pendingMoves.signings.length +
          pendingMoves.trades.length +
          pendingMoves.optionDecisions.length +
          pendingMoves.releases.length,
      },
    }
  }, [
    selectedTeamAbbr,
    selectedTeam,
    roster,
    savedContracts,
    deletedContractIds,
    normalizedTrades,
    draftPickPlayers,
    releasedRosterIds,
    releaseDetails,
    tradedRosterPlayerIds,
    renouncedCapHolds,
    hasUnsavedChanges,
    activeCapSheet,
    // The roster-context helpers are deliberately left out: they close over
    // live state and are re-created every render, so listing them would make
    // this whole derivation run on every keystroke in the panels that host the
    // chat. The state they read is already covered by the entries above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ])
}
