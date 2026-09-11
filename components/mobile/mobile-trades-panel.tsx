'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SavedTrade, SEASONS } from '@/lib/types'
import { CAP_THRESHOLDS, formatCurrency, getApronStatus } from '@/lib/data'
import { partnersOf } from '@/lib/trade-model'
import { getTradeFirstSeasonTotals, resolveTradeAssets } from '@/lib/trade-summary'
import { getTeamCapState } from '@/lib/team-cap-state'
import { getHeldTPEView } from '@/lib/trade-exceptions'
import { MobilePanelCard } from '@/components/mobile/mobile-panel-card'
import { MobileTradeBuilder } from '@/components/mobile/mobile-trade-builder'
import { GmChat } from '@/components/gm-chat/gm-chat'
import { useTradeChatFocus } from '@/lib/gm-chat/focus'
import type { TradeDraftSnapshot } from '@/lib/gm-chat/types'
import { ArrowLeftRight, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SEASON = SEASONS[0]

// Apron status governs which matching rule a team trades under, so the band
// states both together. The rules mirror trade-validation.ts's match tiers:
// dollar-for-dollar and no aggregation at the second apron, dollar-for-dollar
// at the first, and the expanded 125%-style bands below it.
const MATCH_RULE: Record<string, string> = {
  '2nd Apron': '100% match · no aggregation',
  '1st Apron': '100% match',
}

const APRON_BAND_TONE: Record<string, string> = {
  '2nd Apron': 'bg-red-500/10 text-red-600',
  '1st Apron': 'bg-orange-500/10 text-orange-600',
  'Luxury Tax': 'bg-amber-500/10 text-amber-700',
}

export function MobileTradesPanel({
  expanded,
  onToggleExpand,
  panelStyle,
  panelRef,
}: {
  expanded: boolean
  onToggleExpand: () => void
  panelStyle: React.CSSProperties
  panelRef: React.Ref<HTMLDivElement>
}) {
  const {
    selectedTeamAbbr,
    getTeamCapTotal,
    savedTrades,
    normalizedTrades,
    removeSavedTrade,
    roster,
    draftPickPlayers,
  } = useRoster()

  const [builderOpen, setBuilderOpen] = useState(false)
  // Mirrored up from the builder so the trade chat sees the live deal.
  const [draft, setDraft] = useState<TradeDraftSnapshot | null>(null)
  const chatFocus = useTradeChatFocus(draft)
  const [editingTrade, setEditingTrade] = useState<SavedTrade | null>(null)
  const [openTradeId, setOpenTradeId] = useState<string | null>(null)

  const thresholds = CAP_THRESHOLDS[SEASON]
  const { apronTotal } = getTeamCapTotal(selectedTeamAbbr, SEASON)
  const capStatus = getApronStatus(apronTotal, thresholds)
  const apronLabel = capStatus === 'Below Cap' || capStatus === 'Over Cap' ? 'Below 1st Apron' : capStatus
  const overFirstApron = capStatus === '1st Apron' || capStatus === '2nd Apron'
  const overSecondApron = capStatus === '2nd Apron'

  const capState = getTeamCapState(selectedTeamAbbr, SEASON)
  const cashLedger = capState?.cashLedger
  const heldTPEs = getHeldTPEView(selectedTeamAbbr, SEASON, overFirstApron)

  function openBuilder(trade: SavedTrade | null) {
    setEditingTrade(trade)
    setBuilderOpen(true)
  }

  function closeBuilder() {
    setBuilderOpen(false)
    setEditingTrade(null)
  }

  return (
    <MobilePanelCard
      title="Trades"
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      panelStyle={panelStyle}
      panelRef={panelRef}
      gap="gap-2.5"
      headerAction={<GmChat surface="trade" variant="inline-muted" focus={chatFocus} />}
    >
      {!builderOpen ? (
        <>
          <div className={cn('w-full rounded-[10px] px-3 py-2 flex flex-col', APRON_BAND_TONE[capStatus] ?? 'bg-muted text-muted-foreground')}>
            <span className="text-[12.5px] font-bold">{apronLabel}</span>
            <span className="text-[10.5px] font-medium opacity-80">{MATCH_RULE[capStatus] ?? '125% match'}</span>
          </div>

          {(cashLedger || heldTPEs.length > 0) && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {cashLedger && (
                <>
                  <span className="text-[10.5px] font-medium px-2 py-1 rounded-full border border-border bg-muted/40 whitespace-nowrap inline-flex items-center gap-1">
                    <span className="text-muted-foreground">Cash out</span>
                    <span className={cn('font-mono font-semibold tabular-nums', overSecondApron && 'text-amber-600')}>
                      {overSecondApron ? 'Restricted' : formatCurrency(cashLedger.availableToSend)}
                    </span>
                  </span>
                  <span className="text-[10.5px] font-medium px-2 py-1 rounded-full border border-border bg-muted/40 whitespace-nowrap inline-flex items-center gap-1">
                    <span className="text-muted-foreground">Cash in</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatCurrency(cashLedger.availableToReceive)}
                    </span>
                  </span>
                </>
              )}
              {heldTPEs.map((tpe) => (
                <span
                  key={tpe.id}
                  title={tpe.fromPlayer ? `From: ${tpe.fromPlayer}` : 'Generated by trade'}
                  className={cn(
                    'text-[10px] px-1.5 py-[3px] rounded border whitespace-nowrap inline-flex items-center gap-1',
                    tpe.locked ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-muted/40'
                  )}
                >
                  <span className={cn('font-mono text-[10.5px] font-bold tabular-nums', tpe.locked && 'text-amber-600')}>
                    {formatCurrency(tpe.amount)}
                  </span>
                  <span className={cn('text-[9px]', tpe.expiringSoon ? 'text-amber-600 font-semibold' : 'text-muted-foreground/70')}>
                    TPE {tpe.daysLeft}d
                  </span>
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => openBuilder(null)}
            className="w-full h-11 rounded-[10px] bg-primary text-primary-foreground text-[13.5px] font-bold inline-flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Build Trade
          </button>
        </>
      ) : (
        <MobileTradeBuilder editingTrade={editingTrade ?? undefined} onDone={closeBuilder} onDraftChange={setDraft} />
      )}

      <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Saved trades · {savedTrades.length}
      </p>
      {normalizedTrades.map((trade, index) => {
        const { outgoingTotal, incomingTotal } = getTradeFirstSeasonTotals(trade, selectedTeamAbbr, roster, draftPickPlayers)
        const open = openTradeId === trade.id
        const assets = open ? resolveTradeAssets(trade, selectedTeamAbbr, roster, draftPickPlayers) : []

        return (
          <div key={trade.id} className="border-b border-border/40">
            <button
              onClick={() => setOpenTradeId(open ? null : trade.id)}
              className="w-full flex items-center gap-2 py-2 text-left"
            >
              <span className="shrink-0 h-6 w-6 rounded-full bg-muted inline-flex items-center justify-center">
                <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-semibold truncate">
                  {partnersOf(trade, selectedTeamAbbr).join(' · ') || 'No partner'}
                </span>
                <span className="block text-[10.5px] text-muted-foreground font-mono">
                  out {formatCurrency(outgoingTotal)} → in {formatCurrency(incomingTotal)}
                </span>
              </span>
              <span className="shrink-0 text-[9.5px] font-semibold text-muted-foreground">
                {new Date(trade.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <ChevronRight
                className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200', open && 'rotate-90')}
              />
            </button>

            {open && (
              <div className="pb-2 pl-8 flex flex-col gap-1">
                {assets.map((asset) => (
                  <div key={asset.key} className="flex items-center gap-2 text-[11.5px]">
                    <span
                      className={cn(
                        'shrink-0 text-[8.5px] font-bold px-1 py-px rounded',
                        asset.direction === 'OUT' ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'
                      )}
                    >
                      {asset.direction}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{asset.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {asset.direction === 'OUT' ? 'to' : 'from'} {asset.team}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[10.5px] text-muted-foreground">
                      {asset.amount ? formatCurrency(asset.amount) : '—'}
                    </span>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => openBuilder(savedTrades[index])}
                    className="h-8 px-2.5 rounded-md border border-input text-[11px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => { setOpenTradeId(null); removeSavedTrade(trade.id) }}
                    className="h-8 px-2.5 rounded-md border border-input text-[11px] font-semibold text-destructive inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </MobilePanelCard>
  )
}
