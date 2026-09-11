'use client'

import { useState } from 'react'
import Image from 'next/image'
import { SavedTrade, Season } from '@/lib/types'
import { SEASONS } from '@/lib/types'
import { TEAM_NAMES, formatCurrency, getCapStatus, getCapStatusColor, getTeamLogoUrl } from '@/lib/data'
import { DraftPick } from '@/lib/draft-picks'
import { DraftPickHoverContent } from '@/components/draft-pick-hover'
import { getTeamCapState } from '@/lib/team-cap-state'
import {
  getPostTradeTotal,
  parsePickIdMeta,
  TRADE_EVAL_SEASON,
  FIDELITY_NOTE,
} from '@/lib/trade-validation'
import { MAX_TEAMS, assetKey, getFirstYearSalary, useTradeBuilder } from '@/hooks/use-trade-builder'
import type { TradeDraftSnapshot } from '@/lib/gm-chat/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Plus, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const PICK_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032]

function ContractDetail({
  name,
  salary,
  options,
}: {
  name: string
  salary: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
}) {
  const seasons = SEASONS.filter((s) => salary[s] && salary[s]! > 0)
  if (seasons.length === 0) return null
  return (
    <div className="w-48 p-2.5">
      <p className="text-xs font-semibold mb-2 truncate">{name}</p>
      <div className="space-y-1">
        {seasons.map((s) => {
          const opt = options?.[s]
          return (
            <div key={s} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s}</span>
              <div className="flex items-center gap-1">
                <span className="font-mono tabular-nums">{formatCurrency(salary[s]!)}</span>
                {opt && (
                  <span className={cn(
                    'text-[8px] px-0.5 rounded font-semibold',
                    opt === 'Team' ? 'bg-amber-500/20 text-amber-700' : 'bg-sky-500/20 text-sky-700'
                  )}>
                    {opt === 'Team' ? 'TO' : 'PO'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HoverName({
  name,
  salary,
  options,
  draftPick,
  className,
}: {
  name: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
  className?: string
}) {
  const [hovering, setHovering] = useState(false)
  const hasContract = salary && Object.values(salary).some((v) => v && v > 0)

  if (!draftPick && !hasContract) {
    return <span className={cn('font-medium truncate flex-1', className)}>{name}</span>
  }

  return (
    <Popover open={hovering}>
      <PopoverTrigger asChild>
        <span
          className={cn('font-medium truncate flex-1 cursor-default underline decoration-dotted decoration-muted-foreground/40 underline-offset-2', className)}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {name}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className={draftPick ? 'w-64 p-3 text-xs' : 'p-0 w-auto'}
        sideOffset={8}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {draftPick ? <DraftPickHoverContent dp={draftPick} /> : <ContractDetail name={name} salary={salary!} options={options} />}
      </PopoverContent>
    </Popover>
  )
}

// Row in the "available" list — clicking adds to trade
function AvailableRow({
  label,
  sub,
  salary,
  options,
  draftPick,
  onClick,
}: {
  label: string
  sub?: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs hover:bg-muted/60 transition-colors group cursor-pointer"
    >
      <HoverName name={label} salary={salary} options={options} draftPick={draftPick} className="text-foreground" />
      <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
        {sub && <span className="text-muted-foreground font-mono tabular-nums">{sub}</span>}
        <Plus className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
      </div>
    </div>
  )
}

// Chip in the "sending" tray — carries the destination picker that makes
// partner-to-partner legs expressible, plus (for a player landing on a team
// with a usable exception) the held-TPE picker.
function TradeChip({
  label,
  sub,
  salary,
  options,
  draftPick,
  onRemove,
  destinations,
  destination,
  onDestinationChange,
  tpeOptions,
  tpeValue,
  onTpeChange,
}: {
  label: string
  sub?: string
  salary?: Partial<Record<Season, number>>
  options?: Partial<Record<Season, 'Player' | 'Team'>>
  draftPick?: DraftPick
  onRemove: () => void
  destinations: string[]
  destination: string
  onDestinationChange: (to: string) => void
  tpeOptions?: { id: string; label: string }[]
  tpeValue?: string
  onTpeChange?: (tpeId: string) => void
}) {
  return (
    <div className="rounded bg-muted/50 border border-border/60">
      <div className="flex items-center justify-between px-2 py-1 text-xs">
        <HoverName name={label} salary={salary} options={options} draftPick={draftPick} className="text-foreground" />
        <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
          {sub && <span className="text-muted-foreground font-mono tabular-nums text-[10px]">{sub}</span>}
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Remove ${label} from trade`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="px-2 pb-1 space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 shrink-0">to</span>
          <select
            value={destination}
            onChange={(e) => onDestinationChange(e.target.value)}
            className="flex-1 h-5 text-[10px] bg-background border border-border/60 rounded px-1"
            aria-label={`Destination team for ${label}`}
          >
            {destinations.map((t) => (
              <option key={t} value={t}>{TEAM_NAMES[t] || t}</option>
            ))}
          </select>
        </div>
        {tpeOptions && tpeOptions.length > 0 && (
          <select
            value={tpeValue ?? ''}
            onChange={(e) => onTpeChange?.(e.target.value)}
            className="w-full h-5 text-[10px] bg-background border border-border/60 rounded px-1 text-muted-foreground"
            aria-label={`Trade exception absorbing ${label}`}
          >
            <option value="">Match with salary (no TPE)</option>
            {tpeOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 bg-muted/20">
      {children}
    </div>
  )
}

/**
 * The desktop trade builder, inline in the Trades panel rather than in a
 * dialog: every participating team's tray side by side in fixed-width columns,
 * scrolling sideways past three teams.
 *
 * Shares useTradeBuilder with the mobile builder, so availability filtering,
 * per-asset routing, TPE absorption and the validator verdict are one
 * implementation seen through two layouts.
 */
export function DesktopTradeBuilder({
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
    draftPickFor,
    analysis,
    canSave,
    isValid,
    reset,
    save,
    close,
  } = useTradeBuilder({ isActive: true, editingTrade, onDone, onDraftChange })

  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false)

  // A plain function rather than a nested component: a component declared
  // inside the render body is a new type on every render, so React would
  // unmount and remount each column — dropping focus mid-keystroke in the cash
  // input.
  function renderTeamColumn(teamAbbr: string) {
    const isOwn = teamAbbr === selectedTeamAbbr
    const { players, picks } = assetsAvailableFor(teamAbbr)
    const sending = movements.filter((m) => m.from === teamAbbr)
    const receiving = movements.filter((m) => m.to === teamAbbr)
    const destinations = teams.filter((t) => t !== teamAbbr)
    const usedTpeIds = new Set(movements.map((m) => m.heldTpeId).filter(Boolean) as string[])

    return (
      <div key={teamAbbr} className="flex flex-col border-r border-border last:border-r-0 shrink-0" style={{ width: 246 }}>
        <div className="px-2.5 py-1.5 bg-muted/30 border-b border-border flex items-center justify-between gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
            {isOwn ? 'Your Side' : teamAbbr}
          </span>
          {!isOwn && (
            <button
              onClick={() => removeTeam(teamAbbr)}
              className="text-muted-foreground/60 hover:text-red-600 transition-colors shrink-0"
              aria-label={`Remove ${teamAbbr} from trade`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        <SectionLabel>Available — click to add</SectionLabel>
        <div className="p-1.5 flex flex-col gap-0.5">
          {destinations.length === 0 ? (
            <p className="text-[11px] text-muted-foreground px-1.5 py-2">Add a partner team above before adding assets.</p>
          ) : players.length === 0 && picks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground px-1.5 py-2">All assets added to trade</p>
          ) : (
            <>
              {players.map((p) => (
                <AvailableRow
                  key={p.id}
                  label={p.name}
                  sub={formatCurrency(getFirstYearSalary(p.salary))}
                  salary={p.salary}
                  options={p.options}
                  onClick={() =>
                    addMovement({
                      kind: 'player',
                      from: teamAbbr,
                      to: defaultDestination(teamAbbr),
                      id: p.id,
                      name: p.name,
                      salary: p.salary,
                      options: p.options ?? {},
                    })
                  }
                />
              ))}
              {picks.map((p) => {
                const { pickYear, pickRound } = parsePickIdMeta(p.id)
                return (
                  <AvailableRow
                    key={p.id}
                    label={p.name}
                    draftPick={p.draftPick}
                    onClick={() =>
                      addMovement({
                        kind: 'pick',
                        from: teamAbbr,
                        to: defaultDestination(teamAbbr),
                        id: p.id,
                        name: p.name,
                        salary: p.salary,
                        options: p.options ?? {},
                        pickYear,
                        pickRound,
                      })
                    }
                  />
                )
              })}
            </>
          )}

          <div className="pt-1.5 mt-1 border-t border-border/40">
            <p className="text-[9.5px] text-muted-foreground/70 px-1 pb-1">Add custom pick</p>
            <div className="flex items-center gap-1">
              <select
                value={pickDraft.year}
                onChange={(e) => setPickDraft({ ...pickDraft, year: e.target.value })}
                className="flex-1 min-w-0 h-6 text-[10px] rounded border border-input bg-background px-1"
                aria-label="Custom pick year"
              >
                {PICK_YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              <select
                value={pickDraft.round}
                onChange={(e) => setPickDraft({ ...pickDraft, round: e.target.value as 'First Round' | 'Second Round' })}
                className="h-6 text-[10px] rounded border border-input bg-background px-1"
                style={{ width: 44 }}
                aria-label="Custom pick round"
              >
                <option value="First Round">1st</option>
                <option value="Second Round">2nd</option>
              </select>
              {pickDraft.round === 'First Round' && (
                <select
                  value={pickDraft.number}
                  onChange={(e) => setPickDraft({ ...pickDraft, number: e.target.value })}
                  className="h-6 text-[10px] rounded border border-input bg-background px-1"
                  style={{ width: 48 }}
                  aria-label="Custom pick number"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>#{n}</option>)}
                </select>
              )}
              <button
                onClick={() => addCustomPick(teamAbbr)}
                disabled={destinations.length === 0}
                className="h-6 w-6 shrink-0 rounded border border-input text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors inline-flex items-center justify-center disabled:opacity-40"
                aria-label={`Add custom pick from ${teamAbbr}`}
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            </div>
            <button
              onClick={() => addCashLeg(teamAbbr)}
              disabled={destinations.length === 0}
              className="mt-1 h-6 w-full rounded border border-input text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors inline-flex items-center justify-center gap-1 disabled:opacity-40"
            >
              <Plus className="h-2.5 w-2.5" />
              Send cash
            </button>
          </div>
        </div>

        <SectionLabel>Sending{sending.length > 0 ? ` · ${sending.length}` : ''}</SectionLabel>
        <div className="p-1.5 flex flex-col gap-1">
          {sending.length === 0 ? (
            <p className="text-[11px] text-muted-foreground p-1.5">No assets selected yet</p>
          ) : (
            sending.map((m) => {
              if (m.kind === 'cash') {
                return (
                  <div key={assetKey(m.from, m.id)} className="rounded bg-muted/50 border border-border/60 px-2 py-1 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium">Cash</span>
                      <button
                        onClick={() => removeMovement(m.from, m.id)}
                        className="text-muted-foreground hover:text-red-600"
                        aria-label="Remove cash from trade"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="100000"
                      placeholder="0"
                      value={m.amount || ''}
                      onChange={(e) => updateMovement(m.from, m.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="w-full h-5 px-1 rounded border border-border/60 bg-background text-[10px] font-mono"
                      aria-label="Cash amount"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 shrink-0">to</span>
                      <select
                        value={m.to}
                        onChange={(e) => updateMovement(m.from, m.id, { to: e.target.value })}
                        className="flex-1 h-5 text-[10px] bg-background border border-border/60 rounded px-1"
                        aria-label="Cash destination team"
                      >
                        {destinations.map((t) => <option key={t} value={t}>{TEAM_NAMES[t] || t}</option>)}
                      </select>
                    </div>
                  </div>
                )
              }

              // A TPE belongs to the team *receiving* the player.
              const receivingCapState = getTeamCapState(m.to, TRADE_EVAL_SEASON)
              const salaryIn = getFirstYearSalary(m.salary ?? {})
              const eligibleTPEs =
                m.kind === 'player'
                  ? (receivingCapState?.heldTPEs ?? []).filter(
                      (t) => (t.id === m.heldTpeId || !usedTpeIds.has(t.id)) && salaryIn <= t.amount + 100_000
                    )
                  : []

              return (
                <TradeChip
                  key={assetKey(m.from, m.id)}
                  label={m.name ?? m.id}
                  sub={m.kind === 'player' ? formatCurrency(salaryIn) : undefined}
                  salary={m.salary}
                  options={m.options}
                  draftPick={m.kind === 'pick' ? draftPickFor(teamAbbr, m.id) : undefined}
                  onRemove={() => removeMovement(m.from, m.id)}
                  destinations={destinations}
                  destination={m.to}
                  onDestinationChange={(to) => updateMovement(m.from, m.id, { to })}
                  tpeOptions={eligibleTPEs.map((t) => ({
                    id: t.id,
                    label: `${m.to} TPE ${formatCurrency(t.amount)} (${t.fromPlayer ?? 'prior trade'})`,
                  }))}
                  tpeValue={m.heldTpeId ?? ''}
                  onTpeChange={(tpeId) => updateMovement(m.from, m.id, { heldTpeId: tpeId || undefined })}
                />
              )
            })
          )}
        </div>

        <SectionLabel>Receiving{receiving.length > 0 ? ` · ${receiving.length}` : ''}</SectionLabel>
        <div className="p-1.5 flex flex-col gap-0.5">
          {receiving.length === 0 ? (
            <p className="text-[11px] text-muted-foreground p-1.5">Nothing incoming</p>
          ) : (
            receiving.map((m) => (
              <div key={assetKey(m.from, m.id)} className="flex items-center justify-between px-1.5 py-1 text-[11px] rounded bg-muted/30">
                <span className="truncate font-medium">
                  {m.kind === 'cash' ? `Cash ${formatCurrency(m.amount ?? 0)}` : m.name ?? m.id}
                </span>
                <span className="text-[9px] text-muted-foreground shrink-0 ml-1.5">from {m.from}</span>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[7px] border border-border overflow-hidden flex flex-col">
      <div className="px-2.5 py-2 bg-accent flex items-center justify-between gap-2 shrink-0">
        <span className="text-[12px] font-semibold">{editingTrade ? 'Edit Trade' : 'Build Trade'}</span>
        <button onClick={close} className="text-muted-foreground/60 hover:text-foreground transition-colors" aria-label="Close trade builder">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="px-2.5 py-2 flex flex-wrap items-center gap-2 border-b border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Teams</span>
        <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          {selectedTeamAbbr}
        </span>
        {partners.map((abbr) => (
          <span key={abbr} className="text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-muted flex items-center gap-1">
            {abbr}
            <button
              onClick={() => removeTeam(abbr)}
              className="text-muted-foreground hover:text-red-600"
              aria-label={`Remove ${abbr}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {teams.length < MAX_TEAMS && (
          <Popover open={isTeamPickerOpen} onOpenChange={setIsTeamPickerOpen}>
            <PopoverTrigger asChild>
              <button
                className="h-6 text-[10.5px] rounded border border-input bg-background px-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Add a team to the trade"
              >
                {partners.length === 0 ? 'Select a team…' : 'Add a team…'}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-0 max-h-[320px] overflow-y-auto z-[80]">
              {availableTeams.map((abbr) => (
                <button
                  key={abbr}
                  onClick={() => { addTeam(abbr); setIsTeamPickerOpen(false) }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent text-left"
                >
                  <Image src={getTeamLogoUrl(abbr)} alt={abbr} width={18} height={18} className="object-contain shrink-0" />
                  <span className="truncate">{TEAM_NAMES[abbr] || abbr}</span>
                  <span className="text-muted-foreground shrink-0">({abbr})</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="overflow-x-auto border-b border-border">
        <div className="flex">{teams.map((abbr) => renderTeamColumn(abbr))}</div>
      </div>

      <div className="px-2.5 py-2 flex flex-col gap-2">
        <p className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">After this trade</p>

        {!analysis || movements.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Click assets above to build a deal — matching, apron rules, and post-trade totals appear here.
          </p>
        ) : (
          <>
            {analysis.sides.map((side) => {
              const postTotal = getPostTradeTotal(side, analysis.season, analysis.thresholds)
              const delta = postTotal - side.preTradeTotal
              const preStatus = getCapStatus(side.preTradeTotal, analysis.thresholds)
              const postStatus = getCapStatus(postTotal, analysis.thresholds)
              return (
                <div key={side.teamAbbr} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium truncate">
                    {side.teamName}
                    {side.approximate && <span className="text-muted-foreground font-normal"> (est.)</span>}
                  </span>
                  <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
                    <span className="text-muted-foreground">{formatCurrency(side.preTradeTotal)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={preStatus !== postStatus ? 'font-bold' : ''}>{formatCurrency(postTotal)}</span>
                    <span className={cn('text-[10px]', delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                      ({delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(delta))})
                    </span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-px rounded', getCapStatusColor(postStatus))}>
                      {postStatus}
                    </span>
                  </div>
                </div>
              )
            })}

            {analysis.validation.errors.length > 0 && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-2 flex flex-col gap-1">
                <p className="text-[11px] font-semibold text-red-600">Trade Invalid</p>
                {analysis.validation.errors.map((e, i) => (
                  <p key={i} className="text-[11px] text-foreground/90">
                    {teams.length > 2 && e.teamAbbr && <span className="font-semibold">{e.teamAbbr}: </span>}
                    {e.message}
                  </p>
                ))}
              </div>
            )}

            {analysis.validation.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-amber-600">Heads up</p>
                {analysis.validation.warnings.map((w, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <p className="text-[11px] text-foreground/90">
                      {teams.length > 2 && w.teamAbbr && <span className="font-semibold">{w.teamAbbr}: </span>}
                      {w.message}
                    </p>
                    {w.whyUncertain && (
                      <p className="text-[10px] text-muted-foreground pl-2">
                        <span className="font-medium">Why this is uncertain:</span> {w.whyUncertain}
                      </p>
                    )}
                    {w.neededInfo && (
                      <p className="text-[10px] text-muted-foreground pl-2">
                        <span className="font-medium">To verify:</span> {w.neededInfo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {analysis.validation.errors.length === 0 && analysis.validation.warnings.length === 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-600">
                <Check className="h-3 w-3" />
                No rule violations detected
              </p>
            )}

            <p className="text-[9.5px] text-muted-foreground/70 leading-relaxed">{FIDELITY_NOTE}</p>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={reset}
            className="flex-1 h-7 rounded-md border border-input text-[11px] font-semibold hover:bg-muted/50 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={save}
            disabled={!canSave || !isValid}
            title={!isValid ? 'Resolve the issues in Trade Invalid to save.' : undefined}
            className={cn(
              'flex-1 h-7 rounded-md text-[11px] font-semibold text-primary-foreground transition-colors',
              canSave && isValid ? 'bg-primary hover:bg-primary/90' : 'bg-primary/40 cursor-not-allowed'
            )}
          >
            {editingTrade ? 'Save Changes' : 'Save Trade'}
          </button>
        </div>
      </div>
    </div>
  )
}
