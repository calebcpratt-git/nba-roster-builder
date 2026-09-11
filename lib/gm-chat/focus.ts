'use client'

// Builds the surface-specific half of what the specialist chats are given.
//
// useGmChatContext (context.ts) already covers the whole cap sheet; these hooks
// add the working state of the move the user is actually in the middle of — the
// deal on the trade board, or the pool and mechanisms in the signing panel —
// so the trade and free-agent chats can answer about *this* move rather than
// the roster in general.

import { useMemo } from 'react'
import { useRoster } from '../roster-context'
import { CAP_THRESHOLDS, getApronStatus } from '../data'
import { LEAGUE_CAP } from '../league-cap'
import { getTeamCapState } from '../team-cap-state'
import { getSigningExceptions, getUsedExceptions } from '../signing-exceptions'
import { TEAM_CAP_STATE } from '../team-cap-state'
import { getAvailableFreeAgents } from '../free-agent-pool'
import { getOwnUnresolvedRFAs } from '../restricted-free-agency'
import { getPicksByTeamAbbr } from '../draft-picks'
import { SEASONS, type Season } from '../types'
import type { FreeAgentChatFocus, TradeChatFocus, TradeDraftSnapshot } from './types'

/** How many free agents to name before the list stops earning its tokens. */
const FREE_AGENT_SAMPLE = 40

export function useTradeChatFocus(draft?: TradeDraftSnapshot | null): TradeChatFocus {
  const { selectedTeamAbbr, getTeamCapTotal } = useRoster()
  const season = SEASONS[0]

  return useMemo(() => {
    const { apronTotal } = getTeamCapTotal(selectedTeamAbbr, season)
    const apronStatus = getApronStatus(apronTotal, CAP_THRESHOLDS[season])
    const overFirstApron = apronStatus === '1st Apron' || apronStatus === '2nd Apron'
    const overSecondApron = apronStatus === '2nd Apron'
    const capState = getTeamCapState(selectedTeamAbbr, season)

    // Mirrors the match tiers in trade-validation.ts so the chat quotes the
    // same rule the validator will enforce when the user hits save.
    const salaryMatch = overFirstApron
      ? '100% of outgoing salary (no cushion)'
      : '125% + $250,000 in the low bracket, tapering to 100% above $29,000,000 outgoing'

    return {
      kind: 'trade',
      season,
      rules: {
        apronStatus,
        salaryMatch,
        canAggregate: !overSecondApron,
        canTakeBackMoreSalary: !overFirstApron,
        canReceiveSignAndTrade: !overFirstApron,
        canUseCash: !overSecondApron,
        cashAvailableToSend: capState?.cashLedger?.availableToSend ?? 0,
        cashAvailableToReceive: capState?.cashLedger?.availableToReceive ?? 0,
        hardCappedAt: capState?.hardCapped?.apron,
      },
      draft: draft && draft.legs.length > 0 ? draft : undefined,
      untradeablePicks: getPicksByTeamAbbr(selectedTeamAbbr)
        .filter((p) => p.frozen)
        .map((p) => ({ year: p.year, round: p.round, reason: 'frozen by the second-apron seven-year rule' })),
    }
    // getTeamCapTotal is re-created every render; see the note in context.ts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamAbbr, season, draft])
}

export function useFreeAgentChatFocus(season: Season): FreeAgentChatFocus {
  const {
    selectedTeamAbbr,
    savedContracts,
    deletedContractIds,
    roster,
    getTeamCapTotal,
    getPendingOfferSheets,
  } = useRoster()

  return useMemo(() => {
    const { capSpaceTotal, apronTotal } = getTeamCapTotal(selectedTeamAbbr, season)
    const leagueCap = LEAGUE_CAP[season]
    const exceptionsUsed = TEAM_CAP_STATE[selectedTeamAbbr]?.[season]?.exceptionsUsed

    // The dollar figure behind each mechanism — the panel only shows the chip,
    // but "what can we actually offer" is the question this chat exists for.
    const amountFor: Record<string, number | undefined> = {
      'room-mle': leagueCap?.exceptions.roomMLE,
      'non-taxpayer-mle': leagueCap?.exceptions.nonTaxpayerMLE,
      'taxpayer-mle': leagueCap?.exceptions.taxpayerMLE,
      'bi-annual': leagueCap?.exceptions.biAnnual,
    }

    const mechanisms = getSigningExceptions(
      season,
      capSpaceTotal,
      apronTotal,
      getUsedExceptions(exceptionsUsed, savedContracts, deletedContractIds, season),
      exceptionsUsed?.dpe?.used ?? false
    ).map((m) => ({ label: m.label, eligible: m.eligible, alreadyUsed: m.alreadyUsed, amount: amountFor[m.key] }))

    const pool = getAvailableFreeAgents(season, savedContracts)

    return {
      kind: 'free-agent',
      season,
      capRoom: (leagueCap?.softCap ?? 0) - capSpaceTotal,
      mechanisms,
      minimumSalary: leagueCap?.minimumByYos[2] ?? 0,
      available: pool.slice(0, FREE_AGENT_SAMPLE).map((p) => ({ name: p.name, priorTeam: p.team })),
      availableCount: pool.length,
      unresolvedRFAs: getOwnUnresolvedRFAs(roster, savedContracts, deletedContractIds).map((r) => `${r.player.name} (${r.season})`),
      pendingOfferSheets: getPendingOfferSheets(selectedTeamAbbr).map(({ contract, fromTeam }) => ({
        player: contract.playerName,
        fromTeam,
        salary: contract.salary,
      })),
    }
    // getTeamCapTotal / getPendingOfferSheets are re-created every render; see
    // the note in context.ts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamAbbr, season, savedContracts, deletedContractIds, roster])
}
