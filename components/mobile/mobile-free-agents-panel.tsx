'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import type { Player, Season } from '@/lib/types'
import { TEAMS, formatCurrency } from '@/lib/data'
import { TEAM_CAP_STATE } from '@/lib/team-cap-state'
import { getAvailableFreeAgents } from '@/lib/free-agent-pool'
import { getSigningExceptions, getUsedExceptions } from '@/lib/signing-exceptions'
import { GmChat } from '@/components/gm-chat/gm-chat'
import { useFreeAgentChatFocus } from '@/lib/gm-chat/focus'
import { getOwnUnresolvedRFAs, summarizeContract } from '@/lib/restricted-free-agency'
import { SignFreeAgentModal } from '@/components/sign-free-agent-modal'
import { MobilePanelCard, MobileAccordionTrigger } from '@/components/mobile/mobile-panel-card'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// The five seasons the pills offer — signing further out than that isn't a
// thing the free-agent list has a pool for.
const PILL_SEASONS = SEASONS.slice(0, 5)

const EXCEPTION_SHORT_LABELS: Record<string, string> = {
  'room-mle': 'Room',
  'non-taxpayer-mle': 'Non-Tax MLE',
  'bi-annual': 'Bi-Annual',
  'taxpayer-mle': 'Tax MLE',
  'disabled-player': 'DPE',
}

export function MobileFreeAgentsPanel({
  season,
  onSeasonChange,
  expanded,
  onToggleExpand,
  panelStyle,
  panelRef,
}: {
  season: Season
  onSeasonChange: (season: Season) => void
  expanded: boolean
  onToggleExpand: () => void
  panelStyle: React.CSSProperties
  panelRef: React.Ref<HTMLDivElement>
}) {
  const {
    selectedTeamAbbr,
    roster,
    savedContracts,
    deletedContractIds,
    getTeamCapTotal,
    getPendingOfferSheets,
    matchOfferSheet,
    declineOfferSheet,
  } = useRoster()

  const [signOpen, setSignOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [exceptionsOpen, setExceptionsOpen] = useState(false)
  const [rfaOpen, setRfaOpen] = useState(false)
  const [signingPlayer, setSigningPlayer] = useState<Player | null>(null)
  const [signingSeason, setSigningSeason] = useState<Season>(season)

  const freeAgents = getAvailableFreeAgents(season, savedContracts).filter((player) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return player.name.toLowerCase().split(' ').some((word) => word.startsWith(query))
  })

  const signed = savedContracts.filter((c) => c.type === 'free-agent' && !deletedContractIds.has(c.id))

  const { capSpaceTotal, apronTotal } = getTeamCapTotal(selectedTeamAbbr, SEASONS[0])
  const exceptionsUsed = TEAM_CAP_STATE[selectedTeamAbbr]?.[SEASONS[0]]?.exceptionsUsed
  const exceptions = getSigningExceptions(
    SEASONS[0],
    capSpaceTotal,
    apronTotal,
    getUsedExceptions(exceptionsUsed, savedContracts, deletedContractIds, SEASONS[0]),
    exceptionsUsed?.dpe?.used ?? false
  )
  const availableExceptionCount = exceptions.filter((e) => e.eligible && !e.alreadyUsed).length

  // Keyed to the season pill the user is on, so the signing chat talks about
  // the same pool and exception set the panel is showing.
  const chatFocus = useFreeAgentChatFocus(season)

  const offerSheets = getPendingOfferSheets(selectedTeamAbbr)
  const unresolvedRFAs = getOwnUnresolvedRFAs(roster, savedContracts, deletedContractIds)

  function openSigning(player: Player, forSeason: Season) {
    setSigningPlayer(player)
    setSigningSeason(forSeason)
  }

  return (
    <MobilePanelCard
      title="Free Agents"
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      panelStyle={panelStyle}
      panelRef={panelRef}
      headerAction={<GmChat surface="sign-free-agent" variant="inline-muted" focus={chatFocus} />}
    >
      {!signOpen ? (
        <button
          onClick={() => setSignOpen(true)}
          className="w-full h-11 rounded-[10px] bg-primary text-primary-foreground text-[13.5px] font-bold inline-flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Sign Free Agents
        </button>
      ) : (
        <div className="rounded-[10px] border border-border overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 p-2 bg-muted/30 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search free agents"
              className="flex-1 min-w-0 h-[34px] rounded-md border border-input bg-background px-2.5 text-[13px]"
            />
            <button
              onClick={() => { setSignOpen(false); setSearch('') }}
              className="shrink-0 h-[34px] w-[34px] text-muted-foreground/70"
              aria-label="Close signing"
            >
              <X className="h-4 w-4 mx-auto" />
            </button>
          </div>

          <div className="flex gap-1.5 px-2 py-1.5 border-b border-border overflow-x-auto">
            {PILL_SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => onSeasonChange(s)}
                className={cn(
                  'shrink-0 h-7 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap',
                  s === season ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto max-h-56">
            {freeAgents.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-[12px] text-muted-foreground">No free agents available</p>
            ) : (
              // Player.id is only unique within one team's roster (`player-${idx}`
              // per getTeamRoster), and this pool spans all 30 teams.
              freeAgents.map((player, index) => (
                <button
                  key={`${player.team}-${player.id}-${index}`}
                  onClick={() => openSigning(player, season)}
                  className="w-full h-11 flex items-center gap-2 px-2.5 text-left border-b border-border/40"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{player.name}</span>
                    <span className="block text-[10.5px] text-muted-foreground">Prior team · {player.team || '—'}</span>
                  </span>
                  <span className="shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Signed · {signed.length}
      </p>
      {signed.map((contract) => {
        const { years, total } = summarizeContract(contract)
        return (
          <div key={contract.id} className="flex items-center gap-2 py-1.5 border-b border-border/40">
            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{contract.playerName}</span>
            <span className="shrink-0 text-[11px] font-mono text-muted-foreground">
              {years}yr / {formatCurrency(total)}
            </span>
          </div>
        )
      })}

      <MobileAccordionTrigger
        label="Signing exceptions"
        summary={`${availableExceptionCount} available`}
        open={exceptionsOpen}
        onToggle={() => setExceptionsOpen((v) => !v)}
      />
      {exceptionsOpen && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {exceptions.map((mechanism) => {
            const available = mechanism.eligible && !mechanism.alreadyUsed
            return (
              <span
                key={mechanism.key}
                title={mechanism.label}
                className={cn(
                  'text-[10px] font-semibold px-1.5 py-[3px] rounded border whitespace-nowrap inline-flex items-center gap-1',
                  available
                    ? 'border-border bg-emerald-500/10 text-emerald-700'
                    : mechanism.alreadyUsed
                      ? 'border-border bg-muted/40 text-muted-foreground line-through'
                      : 'border-dashed border-border text-muted-foreground/80'
                )}
              >
                {EXCEPTION_SHORT_LABELS[mechanism.key] ?? mechanism.label}
              </span>
            )
          })}
        </div>
      )}

      <MobileAccordionTrigger
        label="Restricted free agency"
        summary={String(offerSheets.length + unresolvedRFAs.length)}
        open={rfaOpen}
        onToggle={() => setRfaOpen((v) => !v)}
      />
      {rfaOpen && (
        <div className="flex flex-col gap-1.5">
          {offerSheets.map(({ contract, fromTeam }) => {
            const { years, total, firstSeason } = summarizeContract(contract)
            return (
              <div key={contract.id} className="rounded-[9px] border border-amber-500/25 bg-amber-500/5 px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold truncate">{contract.playerName}</p>
                  <p className="text-[10.5px] text-muted-foreground shrink-0">
                    from {TEAMS[fromTeam]?.name ?? fromTeam}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {years}yr / {formatCurrency(total)} starting {firstSeason}
                </p>
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() => matchOfferSheet(contract, fromTeam)}
                    className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold"
                  >
                    Match
                  </button>
                  <button
                    onClick={() => declineOfferSheet(contract, fromTeam)}
                    className="flex-1 h-9 rounded-md border border-input text-[12px] font-semibold"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )
          })}
          {unresolvedRFAs.map(({ player, season: rfaSeason }) => (
            <button
              key={player.id}
              onClick={() => openSigning(player, rfaSeason)}
              className="w-full h-10 flex items-center gap-2 text-left border-b border-border/40"
            >
              <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{player.name}</span>
              <span className="shrink-0 text-[10.5px] text-muted-foreground">{rfaSeason} · tap to tender</span>
            </button>
          ))}
          {offerSheets.length === 0 && unresolvedRFAs.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground">Nothing pending right now</p>
          )}
        </div>
      )}

      <SignFreeAgentModal
        player={signingPlayer}
        startingSeason={signingSeason}
        isOpen={signingPlayer !== null}
        onClose={() => setSigningPlayer(null)}
      />
    </MobilePanelCard>
  )
}
