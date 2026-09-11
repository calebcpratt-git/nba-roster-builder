'use client'

import { useState } from 'react'
import {
  useRosterCompliance,
  STANDARD_MAXIMUM,
  TWO_WAY_SLOTS,
} from '@/hooks/use-roster-compliance'
import { SpecTooltipTrigger } from '@/components/desktop/spec-tooltip'
import { rosterSpotsTooltip, HARDSHIP_TOOLTIP, PLAYOFF_LOCK_TOOLTIP } from '@/lib/cba-tooltips'
import { ChevronRight, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

function HelpIcon({ dim = false }: { dim?: boolean }) {
  return (
    <HelpCircle
      className={cn('h-3 w-3 shrink-0 cursor-help transition-colors hover:text-foreground', dim ? 'text-muted-foreground/40' : 'text-muted-foreground/60')}
    />
  )
}

/** `15 / 15` — the count, a hairline slash, then the limit. */
function CountPair({ value, limit, warn }: { value: number; limit: number; warn?: boolean }) {
  return (
    <span className="flex items-baseline">
      <span className={cn('font-mono text-[13px] font-bold tabular-nums leading-none', warn && 'text-amber-600')}>
        {value}
      </span>
      <span className="font-mono text-[11px] tabular-nums leading-none text-muted-foreground/50 px-[3px]">/</span>
      <span className="font-mono text-[11px] tabular-nums leading-none text-muted-foreground">{limit}</span>
    </span>
  )
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{children}</span>
  )
}

/** 26×15 track with an 11px knob — smaller than the shadcn Switch, which is sized for form rows. */
function MiniSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[15px] w-[26px] rounded-full transition-colors shrink-0', checked ? 'bg-primary' : 'bg-input')}
    >
      <span
        className="absolute top-[2px] h-[11px] w-[11px] rounded-full bg-background transition-all"
        style={{ left: checked ? 13 : 2 }}
      />
    </button>
  )
}

/**
 * Roster counts and the two eligibility toggles, as a strip under the cap
 * sheet's card header. Desktop only — the mobile layout omits it.
 *
 * `hardship` is lifted here rather than owned internally because it changes the
 * 15-man ceiling the count is judged against, and the playoff-lock flag drives
 * the two-way tray's tagging.
 */
export function RosterComplianceStrip() {
  const [hardship, setHardship] = useState(false)
  const [playoffLock, setPlayoffLock] = useState(false)
  const [twoWayOpen, setTwoWayOpen] = useState(false)

  const { standardCount, twoWayCount, twoWayEntries, twoWayOverLimit, standardWarn, status } =
    useRosterCompliance(hardship)

  const openSlots = Math.max(0, TWO_WAY_SLOTS - twoWayCount)

  return (
    <div className="shrink-0 border-b border-border bg-muted/20 px-[18px] py-2">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <CountPair value={standardCount} limit={STANDARD_MAXIMUM} warn={standardWarn} />
          <Caption>standard</Caption>
          <SpecTooltipTrigger
            id="roster-spots"
            content={rosterSpotsTooltip(status.label)}
            as="button"
            className="self-center"
          >
            <HelpIcon dim />
          </SpecTooltipTrigger>
        </div>

        <span className="bg-border shrink-0" style={{ width: 1, height: 14 }} />

        <button
          onClick={() => setTwoWayOpen((v) => !v)}
          className="flex items-baseline gap-2 whitespace-nowrap group"
          aria-label="Show two-way players"
        >
          <CountPair value={twoWayCount} limit={TWO_WAY_SLOTS} warn={twoWayOverLimit} />
          <Caption>two-way</Caption>
          <ChevronRight
            className={cn(
              'h-3 w-3 self-center text-muted-foreground/50 transition-transform duration-200',
              twoWayOpen && 'rotate-90'
            )}
          />
        </button>

        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Caption>hardship</Caption>
            <SpecTooltipTrigger id="hardship" content={HARDSHIP_TOOLTIP} as="button" className="flex">
              <HelpIcon dim />
            </SpecTooltipTrigger>
            <MiniSwitch checked={hardship} onChange={setHardship} label="Hardship exception active" />
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Caption>playoff lock</Caption>
            <SpecTooltipTrigger id="playoff-lock" content={PLAYOFF_LOCK_TOOLTIP} as="button" className="flex">
              <HelpIcon dim />
            </SpecTooltipTrigger>
            <MiniSwitch checked={playoffLock} onChange={setPlayoffLock} label="Post-March 1 playoff lock" />
          </div>
        </div>
      </div>

      {twoWayOpen && (
        <div className="mt-2 pt-2 border-t border-border/60 flex flex-wrap items-center gap-2">
          {twoWayEntries.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">No two-way players on this roster.</span>
          ) : (
            twoWayEntries.map((entry) => (
              <span
                key={entry.id}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card pl-2 pr-1.5 py-[3px]"
              >
                <span className="text-[11px] font-medium">{entry.playerName}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-sky-600 bg-sky-500/10 rounded px-1.5 py-px">
                  Two-Way
                </span>
                {playoffLock && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-500/10 rounded px-1.5 py-px">
                    Not playoff-eligible
                  </span>
                )}
              </span>
            ))
          )}
          <span className="text-[10px] text-muted-foreground">
            {openSlots} slot{openSlots === 1 ? '' : 's'} open · excluded from Team Salary
          </span>
        </div>
      )}
    </div>
  )
}
