'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ComponentProps } from 'react'
import { DayButton } from 'react-day-picker'
import { useRoster, guaranteedAmountForSeason } from '@/lib/roster-context'
import { Player } from '@/lib/types'
import { formatCurrency } from '@/lib/data'
import { getCurrentSeason, getSeasonDateBounds, guaranteeLockDate, SEASON_CALENDAR } from '@/lib/season-calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReleasePlayerModalProps {
  player: Player | null
  isOpen: boolean
  onClose: () => void
}

// Local-midnight ISO helpers — deliberately not toISOString() (UTC-based),
// which can land on the wrong calendar day depending on the viewer's
// timezone. Everything here compares whole calendar days, never times.
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Green (nothing owed) through amber to red (fully guaranteed) — a visual
// read on how much of the salary is locked in on a given day, at a glance,
// without reading the number itself. hue 142 is Tailwind's emerald-ish
// green, hue 0 is red. The per-day charge only ever reaches a small fraction
// of the full salary before the guarantee date forces it to 100% (174 days
// is a much longer runway than any contract actually gets), so a linear
// ratio->hue mapping stays nearly pure green the whole time and then jumps —
// exactly the "just green then red" look this is fixing. Raising the ratio
// to a fractional power (well under 1) front-loads the color shift so even
// a small amount of accrued exposure reads as a visible amber tone.
function riskColor(ratio: number): { bg: string; text: string } {
  const clamped = Math.min(1, Math.max(0, ratio))
  const eased = Math.pow(clamped, 0.35)
  const hue = 142 - eased * 142
  return {
    bg: `hsl(${hue} 85% 45% / 0.4)`,
    text: `hsl(${hue} 75% 28%)`,
  }
}

export function ReleasePlayerModal({ player, isOpen, onClose }: ReleasePlayerModalProps) {
  const { getReleaseDetail, setReleaseDetail, restoreRosterPlayer, getEffectiveSalary } = useRoster()
  const [date, setDate] = useState(toISODate(new Date()))
  const [claimed, setClaimed] = useState(false)

  useEffect(() => {
    if (!isOpen || !player) return
    const existing = getReleaseDetail(player.id)
    setDate(existing?.date ?? toISODate(new Date()))
    setClaimed(existing?.claimed ?? false)
  }, [isOpen, player, getReleaseDetail])

  const season = getCurrentSeason(parseISODate(date))
  const bounds = season ? getSeasonDateBounds(season) : undefined
  const effectiveSalary = player && season ? getEffectiveSalary(player, season) : 0
  const raw = player && season ? player.guarantees?.[season] : undefined
  const isAlwaysFull = !raw || raw.status === 'full'

  // The two dates the calendar calls out: when the per-day charge starts
  // accruing (season start — meaningless if he's already fully guaranteed),
  // and whichever comes first between the contract's own guarantee date and
  // the CBA's Jan 10 deadline — that's the date the amount stops changing.
  const seasonStart = season ? SEASON_CALENDAR[season]?.seasonStart : undefined
  const vestDate = season && !isAlwaysFull
    ? [raw?.guaranteeDate, guaranteeLockDate(season)].filter((d): d is string => !!d).sort()[0]
    : undefined

  const guaranteedAmount = player && season ? guaranteedAmountForSeason(player, season, effectiveSalary, parseISODate(date)) : 0
  const displayedAmount = claimed ? 0 : guaranteedAmount
  const heroRatio = effectiveSalary > 0 ? guaranteedAmount / effectiveSalary : 0
  const heroTier: 'none' | 'partial' | 'full' = heroRatio <= 0 ? 'none' : heroRatio >= 1 ? 'full' : 'partial'

  const dayButtonComponent = useMemo(() => {
    return function ReleaseDayButton({ className, day, modifiers, ...props }: ComponentProps<typeof DayButton>) {
      const iso = toISODate(day.date)
      const amount = player && season ? guaranteedAmountForSeason(player, season, effectiveSalary, day.date) : 0
      const ratio = effectiveSalary > 0 ? amount / effectiveSalary : 0
      const color = riskColor(ratio)
      const isSeasonStart = !isAlwaysFull && iso === seasonStart
      const isVestDate = !isAlwaysFull && iso === vestDate
      const showColor = !modifiers.outside && !modifiers.disabled && season
      return (
        <button
          type="button"
          {...props}
          disabled={modifiers.disabled}
          style={showColor ? { backgroundColor: color.bg } : undefined}
          className={cn(
            'relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-transparent text-[10px] leading-none transition-colors',
            modifiers.disabled && 'pointer-events-none opacity-30',
            modifiers.outside && 'text-muted-foreground/40',
            modifiers.selected && 'ring-2 ring-inset ring-foreground',
            !modifiers.selected && (isSeasonStart || isVestDate) && 'ring-1 ring-inset ring-foreground/50',
          )}
        >
          <span className="text-[11px] font-medium">{day.date.getDate()}</span>
          {showColor && (
            <span className="font-mono text-[8px] font-semibold" style={{ color: color.text }}>
              {formatCurrency(amount)}
            </span>
          )}
          {(isSeasonStart || isVestDate) && (
            <span className={cn(
              'absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full',
              isVestDate ? 'bg-emerald-600' : 'bg-amber-600'
            )} />
          )}
        </button>
      )
    }
  }, [player, season, effectiveSalary, isAlwaysFull, seasonStart, vestDate])

  if (!player) return null

  const isAlreadyReleased = !!getReleaseDetail(player.id)

  const handleRelease = () => {
    setReleaseDetail(player.id, { date, claimed })
    onClose()
  }

  const handleRestore = () => {
    restoreRosterPlayer(player.id)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Release {player.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* The headline number — this is the whole point of the modal, so it
              leads, front and center, before any of the inputs that drive it. */}
          <div className={cn(
            'rounded-lg border-2 p-4 text-center transition-colors',
            claimed && 'border-emerald-500/50 bg-emerald-500/10',
            !claimed && heroTier === 'none' && 'border-emerald-500/50 bg-emerald-500/10',
            !claimed && heroTier === 'partial' && 'border-amber-500/50 bg-amber-500/10',
            !claimed && heroTier === 'full' && 'border-red-500/50 bg-red-500/10',
          )}>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Dead money if released {formatDate(date)}
            </p>
            <p className={cn(
              'text-4xl font-bold font-mono tabular-nums mt-1',
              claimed && 'text-emerald-600',
              !claimed && heroTier === 'none' && 'text-emerald-600',
              !claimed && heroTier === 'partial' && 'text-amber-600',
              !claimed && heroTier === 'full' && 'text-red-600',
            )}>
              {formatCurrency(displayedAmount)}
            </p>
            {claimed && (
              <p className="text-[11px] font-medium text-emerald-700 mt-1">
                Zeroed out by "claimed off waivers" below — the date no longer matters.
              </p>
            )}
          </div>

          {/* A big either/or picker instead of a switch-plus-paragraph — the
              two outcomes (dead money applies vs. it's wiped to zero) are the
              actual decision, so they get equal-sized, unmissable buttons
              rather than a small toggle nobody would think twice about. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setClaimed(false)}
              className={cn(
                'rounded-lg border-2 p-3 text-center transition-all',
                !claimed ? 'border-red-500 bg-red-500/10 scale-100' : 'border-border/60 bg-muted/20 opacity-50 scale-[0.98] hover:opacity-80'
              )}
            >
              <ShieldAlert className={cn('mx-auto h-7 w-7', !claimed ? 'text-red-600' : 'text-muted-foreground')} />
              <p className={cn('text-[13px] font-bold mt-1', !claimed ? 'text-red-600' : 'text-muted-foreground')}>Not Claimed</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Dead money applies as dated below</p>
            </button>
            <button
              type="button"
              onClick={() => setClaimed(true)}
              className={cn(
                'rounded-lg border-2 p-3 text-center transition-all',
                claimed ? 'border-emerald-500 bg-emerald-500/10 scale-100' : 'border-border/60 bg-muted/20 opacity-50 scale-[0.98] hover:opacity-80'
              )}
            >
              <ShieldCheck className={cn('mx-auto h-7 w-7', claimed ? 'text-emerald-600' : 'text-muted-foreground')} />
              <p className={cn('text-[13px] font-bold mt-1', claimed ? 'text-emerald-600' : 'text-muted-foreground')}>Claimed</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Wipes everything below to $0</p>
            </button>
          </div>

          {isAlwaysFull ? (
            <p className="text-xs text-muted-foreground leading-relaxed rounded-md border bg-muted/30 p-3">
              No non-guaranteed language is on file for this contract — the full salary ({formatCurrency(effectiveSalary)}) is dead money no matter when he's released.
            </p>
          ) : (
            <div className="space-y-2">
              {!claimed && (
                <p className="text-[11px] text-center text-muted-foreground">
                  Every date below is colored by how much would be guaranteed if you released him that day.
                </p>
              )}
              <div className="relative flex justify-center rounded-md border p-1">
                <div className={cn('transition-opacity', claimed && 'pointer-events-none opacity-25 blur-[1px]')}>
                  <Calendar
                    mode="single"
                    selected={parseISODate(date)}
                    onSelect={(d) => d && setDate(toISODate(d))}
                    defaultMonth={parseISODate(date)}
                    startMonth={bounds ? parseISODate(bounds.min) : undefined}
                    endMonth={bounds ? parseISODate(bounds.max) : undefined}
                    disabled={bounds ? { before: parseISODate(bounds.min), after: parseISODate(bounds.max) } : undefined}
                    components={{ DayButton: dayButtonComponent }}
                    className="[--cell-size:2.75rem] p-2"
                  />
                </div>
                {claimed && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="-rotate-6 rounded-md border-4 border-emerald-600 bg-background/95 px-5 py-1.5 shadow-lg">
                      <span className="text-xl font-black tracking-widest text-emerald-600">CLAIMED = $0</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" /> Season starts — per-day charge begins accruing
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Fully guaranteed from here on
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isAlreadyReleased && (
            <Button variant="ghost" onClick={handleRestore} className="mr-auto text-muted-foreground">
              Restore to roster
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleRelease} className="bg-red-600 hover:bg-red-700 text-white">
            {isAlreadyReleased ? 'Update Release' : 'Release Player'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
