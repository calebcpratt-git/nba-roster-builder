'use client'

import { useState } from 'react'
import { SavedTrade } from '@/lib/types'
import { TEAM_NAMES, formatCurrency, getCapStatus, getCapStatusColor } from '@/lib/data'
import { getTeamCapState } from '@/lib/team-cap-state'
import { getPostTradeTotal, parsePickIdMeta, TRADE_EVAL_SEASON } from '@/lib/trade-validation'
import { MAX_TEAMS, assetKey, getFirstYearSalary, useTradeBuilder } from '@/hooks/use-trade-builder'
import type { TradeDraftSnapshot } from '@/lib/gm-chat/types'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const PICK_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032]

function TrayLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{children}</span>
}

/**
 * The trade builder as an inline panel section rather than a dialog — the
 * mobile counterpart of TradeModal's side-by-side columns, showing one team's
 * tray at a time behind a row of team tabs.
 *
 * Both surfaces drive off useTradeBuilder, so availability filtering, the
 * destination/TPE plumbing and the validator verdict are the same code.
 */
export function MobileTradeBuilder({
  editingTrade,
  onDone,
  onDraftChange,
}: {
  editingTrade?: SavedTrade
  onDone: () => void
  onDraftChange?: (draft: TradeDraftSnapshot | null) => void
}) {
  const {
    selectedTeamAbbr,
    teams,
    partners,
    availableTeams,
    movements,
    pickDraft,
    setPickDraft,
    assetsAvailableFor,
    defaultDestination,
    addMovement,
    removeMovement,
    updateMovement,
    addTeam,
    removeTeam,
    addCustomPick,
    addCashLeg,
    analysis,
    canSave,
    isValid,
    reset,
    save,
    close,
  } = useTradeBuilder({ isActive: true, editingTrade, onDone, onDraftChange })

  const [activeTeam, setActiveTeam] = useState(selectedTeamAbbr)
  const [extrasOpen, setExtrasOpen] = useState(false)

  const activeAbbr = teams.includes(activeTeam) ? activeTeam : selectedTeamAbbr
  const isOwn = activeAbbr === selectedTeamAbbr
  const { players, picks } = assetsAvailableFor(activeAbbr)
  const sending = movements.filter((m) => m.from === activeAbbr)
  const receiving = movements.filter((m) => m.to === activeAbbr)
  const destinations = teams.filter((t) => t !== activeAbbr)
  const usedTpeIds = new Set(movements.map((m) => m.heldTpeId).filter(Boolean) as string[])

  return (
    <div className="rounded-[10px] border border-border overflow-hidden flex flex-col">
      <div className="h-10 px-2.5 flex items-center justify-between bg-accent border-b border-border">
        <span className="text-[12.5px] font-bold">{editingTrade ? 'Edit Trade' : 'Build Trade'}</span>
        <button onClick={close} className="text-muted-foreground/70" aria-label="Close trade builder">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Team tabs — the key mobile adaptation: one tray on screen at a time
          instead of the desktop builder's side-by-side columns. */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border overflow-x-auto">
        {teams.map((abbr) => (
          <button
            key={abbr}
            onClick={() => setActiveTeam(abbr)}
            className={cn(
              'shrink-0 h-7 px-3 rounded-full text-[11.5px] font-bold whitespace-nowrap',
              abbr === activeAbbr ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {abbr}
          </button>
        ))}
        {teams.length < MAX_TEAMS && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) addTeam(e.target.value) }}
            className="shrink-0 h-7 text-[11px] rounded-full border border-dashed border-input bg-background px-2 text-muted-foreground"
            aria-label="Add a team to the trade"
          >
            <option value="">+ Team</option>
            {availableTeams.map((abbr) => (
              <option key={abbr} value={abbr}>{TEAM_NAMES[abbr] || abbr}</option>
            ))}
          </select>
        )}
      </div>

      <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-border/60 bg-muted/20">
        <TrayLabel>{isOwn ? 'Your Side' : activeAbbr} — tap to add</TrayLabel>
        {!isOwn && (
          <button
            onClick={() => { removeTeam(activeAbbr); setActiveTeam(selectedTeamAbbr) }}
            className="text-[10px] font-semibold text-red-600"
          >
            Remove
          </button>
        )}
      </div>

      <div className="overflow-y-auto max-h-44">
        {partners.length === 0 ? (
          <p className="px-2.5 py-3 text-[11.5px] text-muted-foreground">Add a partner team above before adding assets.</p>
        ) : players.length === 0 && picks.length === 0 ? (
          <p className="px-2.5 py-3 text-[11.5px] text-muted-foreground">All assets added to trade</p>
        ) : (
          <>
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  addMovement({
                    kind: 'player',
                    from: activeAbbr,
                    to: defaultDestination(activeAbbr),
                    id: p.id,
                    name: p.name,
                    salary: p.salary,
                    options: p.options ?? {},
                  })
                }
                className="w-full h-10 flex items-center gap-2 px-2.5 text-left border-b border-border/40"
              >
                <span className="flex-1 min-w-0 text-[12.5px] font-medium truncate">{p.name}</span>
                <span className="shrink-0 text-[11px] font-mono tabular-nums text-muted-foreground">
                  {formatCurrency(getFirstYearSalary(p.salary))}
                </span>
                <Plus className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />
              </button>
            ))}
            {picks.map((p) => {
              const { pickYear, pickRound } = parsePickIdMeta(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    addMovement({
                      kind: 'pick',
                      from: activeAbbr,
                      to: defaultDestination(activeAbbr),
                      id: p.id,
                      name: p.name,
                      salary: p.salary,
                      options: p.options ?? {},
                      pickYear,
                      pickRound,
                    })
                  }
                  className="w-full h-10 flex items-center gap-2 px-2.5 text-left border-b border-border/40 bg-muted/20"
                >
                  <span className="flex-1 min-w-0 text-[12.5px] font-medium text-muted-foreground truncate">{p.name}</span>
                  <span className="shrink-0 text-[11px] font-mono tabular-nums text-muted-foreground">
                    {formatCurrency(getFirstYearSalary(p.salary))}
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* Assets the roster/pick lists can't offer: a pick this team owns that
          isn't in the app's own pick data, and cash. Folded behind a toggle so
          the tray stays a list of taps in the common case. */}
      <div className="border-b border-border">
        <button
          onClick={() => setExtrasOpen((v) => !v)}
          className="w-full px-2.5 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          disabled={partners.length === 0}
        >
          Custom pick &amp; cash
          <span className="text-[11px]">{extrasOpen ? '−' : '+'}</span>
        </button>
        {extrasOpen && partners.length > 0 && (
          <div className="px-2.5 pb-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <select
                value={pickDraft.year}
                onChange={(e) => setPickDraft({ ...pickDraft, year: e.target.value })}
                className="h-7 text-[11px] rounded border border-input bg-background px-1"
                aria-label="Custom pick year"
              >
                {PICK_YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              <select
                value={pickDraft.round}
                onChange={(e) => setPickDraft({ ...pickDraft, round: e.target.value as 'First Round' | 'Second Round' })}
                className="h-7 text-[11px] rounded border border-input bg-background px-1"
                aria-label="Custom pick round"
              >
                <option value="First Round">1st</option>
                <option value="Second Round">2nd</option>
              </select>
              {pickDraft.round === 'First Round' && (
                <select
                  value={pickDraft.number}
                  onChange={(e) => setPickDraft({ ...pickDraft, number: e.target.value })}
                  className="h-7 text-[11px] rounded border border-input bg-background px-1"
                  aria-label="Custom pick number"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>#{n}</option>)}
                </select>
              )}
              <button
                onClick={() => addCustomPick(activeAbbr)}
                className="h-7 flex-1 rounded border border-input text-[11px] font-semibold"
              >
                Add pick
              </button>
            </div>
            <button
              onClick={() => addCashLeg(activeAbbr)}
              className="h-7 w-full rounded border border-input text-[11px] font-semibold"
            >
              Send cash
            </button>
          </div>
        )}
      </div>

      <div className="px-2.5 py-2 border-t border-border flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <TrayLabel>Sending</TrayLabel>
          {sending.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">Nothing selected yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sending.map((m) => {
                // A TPE belongs to the team *receiving* the player.
                const receivingCapState = getTeamCapState(m.to, TRADE_EVAL_SEASON)
                const salaryIn = getFirstYearSalary(m.salary ?? {})
                const eligibleTPEs =
                  m.kind === 'player'
                    ? (receivingCapState?.heldTPEs ?? []).filter(
                        (t) => (t.id === m.heldTpeId || !usedTpeIds.has(t.id)) && salaryIn <= t.amount + 100_000
                      )
                    : []
                const needsDetail = m.kind === 'cash' || destinations.length > 1 || eligibleTPEs.length > 0

                if (!needsDetail) {
                  return (
                    <span
                      key={assetKey(m.from, m.id)}
                      className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-muted border border-border/60 text-[11.5px]"
                    >
                      <span className="font-medium">{m.name ?? m.id}</span>
                      {m.kind === 'player' && (
                        <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                          {formatCurrency(salaryIn)}
                        </span>
                      )}
                      <button
                        onClick={() => removeMovement(m.from, m.id)}
                        className="text-muted-foreground/70 px-0.5"
                        aria-label={`Remove ${m.name ?? m.id} from trade`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                }

                return (
                  <div
                    key={assetKey(m.from, m.id)}
                    className="w-full rounded-lg bg-muted border border-border/60 px-2 py-1.5 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="font-medium truncate">{m.name ?? m.id}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.kind === 'player' && (
                          <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                            {formatCurrency(salaryIn)}
                          </span>
                        )}
                        <button
                          onClick={() => removeMovement(m.from, m.id)}
                          className="text-muted-foreground/70"
                          aria-label={`Remove ${m.name ?? m.id} from trade`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {m.kind === 'cash' && (
                      <input
                        type="number"
                        min="0"
                        step="100000"
                        placeholder="0"
                        value={m.amount || ''}
                        onChange={(e) => updateMovement(m.from, m.id, { amount: parseFloat(e.target.value) || 0 })}
                        className="h-7 w-full rounded border border-border/60 bg-background px-1.5 text-[11px] font-mono"
                        aria-label="Cash amount"
                      />
                    )}
                    {destinations.length > 1 && (
                      <select
                        value={m.to}
                        onChange={(e) => updateMovement(m.from, m.id, { to: e.target.value })}
                        className="h-7 w-full rounded border border-border/60 bg-background px-1.5 text-[11px]"
                        aria-label={`Destination team for ${m.name ?? m.id}`}
                      >
                        {destinations.map((t) => <option key={t} value={t}>{TEAM_NAMES[t] || t}</option>)}
                      </select>
                    )}
                    {eligibleTPEs.length > 0 && (
                      <select
                        value={m.heldTpeId ?? ''}
                        onChange={(e) => updateMovement(m.from, m.id, { heldTpeId: e.target.value || undefined })}
                        className="h-7 w-full rounded border border-border/60 bg-background px-1.5 text-[11px] text-muted-foreground"
                        aria-label={`Trade exception absorbing ${m.name ?? m.id}`}
                      >
                        <option value="">Match with salary (no TPE)</option>
                        {eligibleTPEs.map((t) => (
                          <option key={t.id} value={t.id}>
                            {m.to} TPE {formatCurrency(t.amount)} ({t.fromPlayer ?? 'prior trade'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <TrayLabel>Receiving</TrayLabel>
          {receiving.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">Nothing incoming</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {receiving.map((m) => (
                <span
                  key={assetKey(m.from, m.id)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-[11.5px]"
                >
                  <span className="font-medium">
                    {m.kind === 'cash' ? `Cash ${formatCurrency(m.amount ?? 0)}` : m.name ?? m.id}
                  </span>
                  <span className="text-[9.5px] text-muted-foreground">from {m.from}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {analysis && movements.length > 0 && (
        <div className="px-2.5 py-2 border-t border-border bg-muted/20 flex flex-col gap-1.5">
          {analysis.sides.map((side) => {
            const postTotal = getPostTradeTotal(side, analysis.season, analysis.thresholds)
            const postStatus = getCapStatus(postTotal, analysis.thresholds)
            return (
              <div key={side.teamAbbr} className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="font-medium truncate">
                  {side.teamName}
                  {side.approximate && <span className="text-muted-foreground font-normal"> (est.)</span>}
                </span>
                <span className="shrink-0 flex items-center gap-1.5">
                  <span className="font-mono tabular-nums text-[10.5px] text-muted-foreground">
                    {formatCurrency(postTotal)}
                  </span>
                  <span className={cn('text-[10px] font-bold px-1.5 py-px rounded', getCapStatusColor(postStatus))}>
                    {postStatus}
                  </span>
                </span>
              </div>
            )
          })}

          {analysis.validation.errors.length > 0 && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-2 flex flex-col gap-1">
              {analysis.validation.errors.map((e, i) => (
                <p key={i} className="text-[11px] text-foreground/90">
                  {teams.length > 2 && e.teamAbbr && <span className="font-semibold">{e.teamAbbr}: </span>}
                  {e.message}
                </p>
              ))}
            </div>
          )}

          {analysis.validation.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 flex flex-col gap-1">
              {analysis.validation.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-foreground/90">
                  {teams.length > 2 && w.teamAbbr && <span className="font-semibold">{w.teamAbbr}: </span>}
                  {w.message}
                </p>
              ))}
            </div>
          )}

          {analysis.validation.errors.length === 0 && analysis.validation.warnings.length === 0 && (
            <p className="text-[11px] text-emerald-600 font-medium">No rule violations detected</p>
          )}
        </div>
      )}

      <div className="px-2.5 py-2 border-t border-border flex gap-2">
        <button onClick={reset} className="flex-1 h-10 rounded-md border border-input text-[12.5px] font-semibold">
          Reset
        </button>
        <button
          onClick={save}
          disabled={!canSave || !isValid}
          title={!isValid ? 'Resolve the listed rule violations to save.' : undefined}
          className={cn(
            'flex-1 h-10 rounded-md text-[11.5px] font-semibold text-primary-foreground',
            canSave && isValid ? 'bg-primary' : 'bg-primary/40'
          )}
        >
          {editingTrade ? 'Save Changes' : 'Save Trade'}
        </button>
      </div>
    </div>
  )
}
