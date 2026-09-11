'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import type { Player, Season } from '@/lib/types'
import { TEAMS, formatCurrency } from '@/lib/data'
import { TEAM_CAP_STATE } from '@/lib/team-cap-state'
import { useCenteredPanelExpand } from '@/hooks/use-expandable-panel'
import { getAvailableFreeAgents } from '@/lib/free-agent-pool'
import { getSigningExceptions, getUsedExceptions } from '@/lib/signing-exceptions'
import { GmChat } from '@/components/gm-chat/gm-chat'
import { useFreeAgentChatFocus } from '@/lib/gm-chat/focus'
import { getOwnUnresolvedRFAs, summarizeContract } from '@/lib/restricted-free-agency'
import { SignFreeAgentModal } from '@/components/sign-free-agent-modal'
import { DesktopPanelShell, PanelBlockLabel } from '@/components/desktop/panel-shell'
import { SpecTooltipTrigger } from '@/components/desktop/spec-tooltip'
import { exceptionTooltip } from '@/lib/cba-tooltips'
import { ChevronRight, HelpCircle, Plus, Scale, UserPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const PILL_SEASONS = SEASONS.slice(0, 5)

const EXCEPTION_SHORT_LABELS: Record<string, string> = {
  'room-mle': 'Room',
  'non-taxpayer-mle': 'Non-Tax MLE',
  'bi-annual': 'Bi-Annual',
  'taxpayer-mle': 'Tax MLE',
  'disabled-player': 'DPE',
}

export function DesktopFreeAgentsPanel() {
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

  const [season, setSeason] = useState<Season>(SEASONS[0])
  const [signOpen, setSignOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [rfaOpen, setRfaOpen] = useState(false)
  const [signingPlayer, setSigningPlayer] = useState<Player | null>(null)
  const [signingSeason, setSigningSeason] = useState<Season>(SEASONS[0])

  const expand = useCenteredPanelExpand({ maxWidth: 760, widthRatio: 0.92, maxHeight: 760, heightRatio: 0.82 })

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

  // Keyed to the season pill the user is on, so the signing chat talks about
  // the same pool and the same exception set the panel is showing.
  const chatFocus = useFreeAgentChatFocus(season)

  const offerSheets = getPendingOfferSheets(selectedTeamAbbr)
  const unresolvedRFAs = getOwnUnresolvedRFAs(roster, savedContracts, deletedContractIds)

  function openSigning(player: Player, forSeason: Season) {
    setSigningPlayer(player)
    setSigningSeason(forSeason)
  }

  return (
    <DesktopPanelShell
      title="Free Agents"
      count={signed.length}
      expanded={expand.expanded}
      onToggleExpand={expand.toggle}
      panelStyle={expand.panelStyle}
      wrapperRef={expand.ref}
      backdropStyle={expand.backdropStyle}
      onBackdropClick={expand.collapse}
      headerAction={<GmChat surface="sign-free-agent" variant="inline" focus={chatFocus} />}
    >
      {!signOpen ? (
        <div className="px-3.5 py-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          <div className="pb-3 border-b border-border/60">
            <PanelBlockLabel>Signing Exceptions</PanelBlockLabel>
            {/* Wrapped rows here; the mobile panel turns the same chips into a
                horizontal scroll strip because it has one column of width. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {exceptions.map((mechanism) => {
                const available = mechanism.eligible && !mechanism.alreadyUsed
                return (
                  <SpecTooltipTrigger
                    key={mechanism.key}
                    id={`exception-${mechanism.key}`}
                    as="button"
                    content={exceptionTooltip(mechanism.key, mechanism.label, mechanism.eligible, mechanism.alreadyUsed)}
                    className={cn(
                      'text-[10px] font-semibold px-1.5 py-[3px] rounded-md border whitespace-nowrap inline-flex items-center gap-1 transition-colors',
                      available
                        ? 'border-border bg-emerald-500/10 text-emerald-700'
                        : mechanism.alreadyUsed
                          ? 'border-border bg-muted/40 text-muted-foreground line-through'
                          : 'border-dashed border-border text-muted-foreground/80'
                    )}
                  >
                    {EXCEPTION_SHORT_LABELS[mechanism.key] ?? mechanism.label}
                    <HelpCircle className="h-3 w-3 opacity-60" />
                  </SpecTooltipTrigger>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSignOpen(true)}
              className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              Sign Free Agents
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-1">Signed Players</p>
            {signed.length === 0 ? (
              <p className="text-[12px] text-muted-foreground px-1">No signings yet.</p>
            ) : (
              signed.map((contract) => {
                const { years, total } = summarizeContract(contract)
                return (
                  <div
                    key={contract.id}
                    className="p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-[13px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium whitespace-nowrap flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{contract.playerName}</span>
                        <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-500/15 px-1 py-px rounded shrink-0">
                          SIGNED
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono whitespace-nowrap shrink-0">
                        {years}yr / {formatCurrency(total)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="pt-3 border-t border-border/60">
            <div
              className="cursor-pointer select-none flex items-center justify-between gap-2"
              onClick={() => setRfaOpen((v) => !v)}
            >
              <div className="text-[12px] font-semibold flex items-center gap-1.5 whitespace-nowrap">
                <Scale className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Restricted Free Agency
                <span className="font-medium text-muted-foreground">{offerSheets.length + unresolvedRFAs.length}</span>
              </div>
              <ChevronRight
                className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300', rfaOpen && 'rotate-90')}
              />
            </div>

            {rfaOpen && (
              <div className="mt-3 flex flex-col gap-3">
                {offerSheets.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-medium text-muted-foreground">Pending offer sheets on your players</p>
                    {offerSheets.map(({ contract, fromTeam }) => {
                      const { years, total, firstSeason } = summarizeContract(contract)
                      return (
                        <div key={contract.id} className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium truncate">{contract.playerName}</p>
                            <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                              from {TEAMS[fromTeam]?.name ?? fromTeam}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {years}yr / {formatCurrency(total)} starting {firstSeason}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => matchOfferSheet(contract, fromTeam)}
                              className="h-7 flex-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                            >
                              Match
                            </button>
                            <button
                              onClick={() => declineOfferSheet(contract, fromTeam)}
                              className="h-7 flex-1 rounded-md border border-input text-xs font-medium hover:bg-accent transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {unresolvedRFAs.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      Your restricted free agents without a qualifying offer
                    </p>
                    {unresolvedRFAs.map(({ player, season: rfaSeason }) => (
                      <div
                        key={player.id}
                        onClick={() => openSigning(player, rfaSeason)}
                        className="p-2.5 rounded-lg border border-muted/20 bg-muted/50 text-sm cursor-pointer hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium truncate">{player.name}</p>
                          <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{rfaSeason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {offerSheets.length === 0 && unresolvedRFAs.length === 0 && (
                  <p className="text-[12px] text-muted-foreground">Nothing pending right now</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3.5 py-3 flex-1 min-h-0 flex flex-col">
          <div className="rounded-[7px] border border-border overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="px-2.5 py-2 bg-accent flex items-center justify-between gap-2 shrink-0">
              <span className="text-[12px] font-semibold flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                <UserPlus className="h-3 w-3 shrink-0 text-muted-foreground" />
                Sign Free Agents
              </span>
              <button
                onClick={() => { setSignOpen(false); setSearch('') }}
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="Close free agent signing"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="px-2.5 py-2 flex gap-2 border-b border-border shrink-0">
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value as Season)}
                className="w-[110px] h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
                aria-label="Season"
              >
                {PILL_SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players..."
                className="flex-1 min-w-0 h-7 rounded-md border border-input bg-transparent px-2 text-[11px]"
              />
            </div>

            <div className="px-2 py-1 flex justify-between border-b border-border/50 bg-muted/20 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              <span>Available — click to sign</span>
              <span>Prior Team</span>
            </div>

            <div className="overflow-y-auto p-1.5 flex flex-col gap-1 flex-1 min-h-0">
              {freeAgents.length === 0 ? (
                <p className="px-1.5 py-2 text-[11px] text-muted-foreground">No free agents available</p>
              ) : (
                // Player.id is only unique within one team's roster (`player-${idx}`
                // per getTeamRoster), and this pool spans all 30 teams.
                freeAgents.map((player, index) => (
                  <div
                    key={`${player.team}-${player.id}-${index}`}
                    onClick={() => openSigning(player, season)}
                    className="group px-1.5 py-1 rounded text-[11px] cursor-pointer flex items-center justify-between hover:bg-muted/60 transition-colors"
                  >
                    <span className="font-medium truncate">{player.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0 ml-1.5">
                      <span className="text-[10px] text-muted-foreground">{player.team || '—'}</span>
                      <Plus className="h-2.5 w-2.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <SignFreeAgentModal
        player={signingPlayer}
        startingSeason={signingSeason}
        isOpen={signingPlayer !== null}
        onClose={() => setSigningPlayer(null)}
      />
    </DesktopPanelShell>
  )
}
