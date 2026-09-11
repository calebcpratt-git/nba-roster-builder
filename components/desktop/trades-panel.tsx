'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SavedTrade, SEASONS } from '@/lib/types'
import { CAP_THRESHOLDS, formatCurrency, getApronStatus } from '@/lib/data'
import { incomingFor, outgoingFor } from '@/lib/trade-model'
import { getTradeFirstSeasonTotals, describeTradePartners, resolveTradeAssets } from '@/lib/trade-summary'
import { getTeamCapState } from '@/lib/team-cap-state'
import { getHeldTPEView } from '@/lib/trade-exceptions'
import { useCenteredPanelExpand } from '@/hooks/use-expandable-panel'
import { DesktopPanelShell, PanelBlockLabel } from '@/components/desktop/panel-shell'
import { DesktopTradeBuilder } from '@/components/desktop/trade-builder'
import { GmChat } from '@/components/gm-chat/gm-chat'
import { useTradeChatFocus } from '@/lib/gm-chat/focus'
import type { TradeDraftSnapshot } from '@/lib/gm-chat/types'
import { SpecTooltipTrigger } from '@/components/desktop/spec-tooltip'
import { apronTooltip, cashInTooltip, cashOutTooltip, tpeTooltip } from '@/lib/cba-tooltips'
import { ArrowLeftRight, HelpCircle, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SEASON = SEASONS[0]

// Mirrors trade-validation.ts's match tiers: dollar-for-dollar and no
// aggregation at the second apron, dollar-for-dollar at the first, and the
// expanded bands below it.
const MATCH_RULE: Record<string, string> = {
  '2nd Apron': '100% match · no aggregation',
  '1st Apron': '100% match',
}

const APRON_CHIP_TONE: Record<string, string> = {
  '2nd Apron': 'bg-red-500/10 text-red-600',
  '1st Apron': 'bg-orange-500/10 text-orange-600',
  'Luxury Tax': 'bg-amber-500/10 text-amber-600',
}

export function DesktopTradesPanel() {
  const {
    selectedTeamAbbr,
    getTeamCapTotal,
    savedTrades,
    normalizedTrades,
    removeSavedTrade,
    roster,
    draftPickPlayers,
  } = useRoster()

  // Inverted from mobile on purpose: the desktop column has room to keep the
  // builder open, so it is the panel's resting state.
  const [builderOpen, setBuilderOpen] = useState(true)
  const [editingTrade, setEditingTrade] = useState<SavedTrade | null>(null)
  // Mirrored up from the builder so the panel's trade chat can see the deal
  // the user is actually assembling, not just the saved ones.
  const [draft, setDraft] = useState<TradeDraftSnapshot | null>(null)
  const chatFocus = useTradeChatFocus(draft)

  const expand = useCenteredPanelExpand({ maxWidth: 900, widthRatio: 0.94, maxHeight: 800, heightRatio: 0.85 })

  const thresholds = CAP_THRESHOLDS[SEASON]
  const { apronTotal } = getTeamCapTotal(selectedTeamAbbr, SEASON)
  const capStatus = getApronStatus(apronTotal, thresholds)
  const apronLabel = capStatus === 'Below Cap' || capStatus === 'Over Cap' ? 'Below 1st Apron' : capStatus
  const matchRule = MATCH_RULE[capStatus] ?? '125% match'
  const overFirstApron = capStatus === '1st Apron' || capStatus === '2nd Apron'
  const overSecondApron = capStatus === '2nd Apron'

  const cashLedger = getTeamCapState(selectedTeamAbbr, SEASON)?.cashLedger
  const heldTPEs = getHeldTPEView(selectedTeamAbbr, SEASON, overFirstApron)

  function openBuilder(trade: SavedTrade | null) {
    setEditingTrade(trade)
    setBuilderOpen(true)
  }

  return (
    <DesktopPanelShell
      title="Trades"
      count={savedTrades.length}
      expanded={expand.expanded}
      onToggleExpand={expand.toggle}
      panelStyle={expand.panelStyle}
      wrapperRef={expand.ref}
      backdropStyle={expand.backdropStyle}
      onBackdropClick={expand.collapse}
      headerAction={<GmChat surface="trade" variant="inline" focus={chatFocus} />}
    >
      {builderOpen ? (
        <div className="px-3.5 py-3 flex-1 min-h-0 overflow-y-auto">
          <DesktopTradeBuilder
            editingTrade={editingTrade ?? undefined}
            onDone={() => { setBuilderOpen(false); setEditingTrade(null) }}
            onDraftChange={setDraft}
          />
        </div>
      ) : (
        <div className="px-3.5 pt-3 pb-3.5 flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto">
          <div className="pb-3 border-b border-border/60">
            <PanelBlockLabel>Trade Tools</PanelBlockLabel>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <SpecTooltipTrigger
                id="apron-rule"
                as="button"
                content={apronTooltip(apronLabel, matchRule)}
                className={cn(
                  'text-[10px] font-semibold px-1.5 py-[3px] rounded-md border border-border whitespace-nowrap inline-flex items-center gap-1',
                  APRON_CHIP_TONE[capStatus] ?? 'bg-muted text-muted-foreground'
                )}
              >
                {apronLabel} · {matchRule}
                <HelpCircle className="h-3 w-3 opacity-70" />
              </SpecTooltipTrigger>

              {cashLedger && (
                <>
                  <SpecTooltipTrigger
                    id="cash-out"
                    as="button"
                    content={cashOutTooltip(cashLedger.availableToSend, overSecondApron)}
                    className="text-[10px] font-medium px-1.5 py-[3px] rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors whitespace-nowrap inline-flex items-center gap-1"
                  >
                    <span className="text-muted-foreground">Cash out</span>
                    <span className={cn('font-mono font-semibold tabular-nums', overSecondApron && 'text-amber-600')}>
                      {overSecondApron ? 'Restricted' : formatCurrency(cashLedger.availableToSend)}
                    </span>
                    <HelpCircle className="h-3 w-3 opacity-60" />
                  </SpecTooltipTrigger>
                  <SpecTooltipTrigger
                    id="cash-in"
                    as="button"
                    content={cashInTooltip(cashLedger.availableToReceive)}
                    className="text-[10px] font-medium px-1.5 py-[3px] rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors whitespace-nowrap inline-flex items-center gap-1"
                  >
                    <span className="text-muted-foreground">Cash in</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatCurrency(cashLedger.availableToReceive)}
                    </span>
                    <HelpCircle className="h-3 w-3 opacity-60" />
                  </SpecTooltipTrigger>
                </>
              )}
            </div>

            {heldTPEs.length > 0 && (
              <div className="mt-2">
                <p className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/70">Held TPEs</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {heldTPEs.map((tpe) => (
                    <SpecTooltipTrigger
                      key={tpe.id}
                      id={`tpe-${tpe.id}`}
                      as="button"
                      content={tpeTooltip(tpe.amount, tpe.fromPlayer, tpe.expires, tpe.daysLeft, tpe.locked)}
                      className={cn(
                        'text-[10px] px-1.5 py-[3px] rounded-md border hover:bg-muted transition-colors whitespace-nowrap inline-flex items-center gap-1',
                        tpe.locked ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-muted/40'
                      )}
                    >
                      <span className={cn('font-mono text-[10.5px] font-bold tabular-nums', tpe.locked && 'text-amber-600')}>
                        {formatCurrency(tpe.amount)}
                      </span>
                      <span className={cn('text-[9px]', tpe.expiringSoon ? 'text-amber-600 font-semibold' : 'text-muted-foreground/70')}>
                        {tpe.daysLeft}d
                      </span>
                    </SpecTooltipTrigger>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => openBuilder(null)}
            className="h-9 w-full rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            Build Trade
          </button>

          {normalizedTrades.length === 0 ? (
            <p className="text-[12px] text-muted-foreground text-center py-2">No trades yet</p>
          ) : (
            normalizedTrades.map((trade, index) => {
              const { season, outgoingTotal, incomingTotal } = getTradeFirstSeasonTotals(
                trade, selectedTeamAbbr, roster, draftPickPlayers
              )
              const assets = resolveTradeAssets(trade, selectedTeamAbbr, roster, draftPickPlayers)
              const out = assets.filter((a) => a.direction === 'OUT')
              const incoming = assets.filter((a) => a.direction === 'IN')

              return (
                <div
                  key={trade.id}
                  onClick={() => openBuilder(savedTrades[index])}
                  className="rounded-[7px] border border-border overflow-hidden cursor-pointer hover:bg-accent/40 transition-colors"
                >
                  <div className="px-2.5 py-2 bg-accent flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold flex items-center gap-1.5 min-w-0">
                      <ArrowLeftRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{describeTradePartners(trade, selectedTeamAbbr)}</span>
                      {trade.isSignAndTrade && (
                        <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1 py-px rounded shrink-0">
                          Sign-and-Trade
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] font-semibold text-muted-foreground">
                        {new Date(trade.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSavedTrade(trade.id) }}
                        className="text-muted-foreground/60 hover:text-destructive transition-colors"
                        title="Remove trade"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="px-2.5 py-2 text-[11.5px] flex flex-col gap-2">
                    <TradeSide label={`Outgoing (${season})`} total={outgoingTotal} assets={out} preposition="to" />
                    <TradeSide label={`Incoming (${season})`} total={incomingTotal} assets={incoming} preposition="from" />
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </DesktopPanelShell>
  )
}

function TradeSide({
  label,
  total,
  assets,
  preposition,
}: {
  label: string
  total: number
  assets: { key: string; name: string; team: string; amount: number }[]
  preposition: 'to' | 'from'
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums font-medium">{formatCurrency(total)}</span>
      </div>
      {assets.map((asset) => (
        <div key={asset.key} className="pl-2 border-l-2 border-border/60 flex items-center justify-between gap-2">
          <span className="text-[11px] truncate">{asset.name}</span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9.5px] text-muted-foreground">{preposition} {asset.team}</span>
            <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
              {asset.amount ? formatCurrency(asset.amount) : '—'}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
