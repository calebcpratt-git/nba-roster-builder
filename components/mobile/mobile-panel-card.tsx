'use client'

import { ChevronRight, Maximize, Minimize } from 'lucide-react'
import { useRoster } from '@/lib/roster-context'
import { cn } from '@/lib/utils'

/**
 * The card shell both mobile panels share: title row with the expand toggle,
 * then the panel's own stack. `panelStyle`/`panelRef` come from
 * useExpandablePanel — when the panel is expanded they turn this into an
 * absolutely-positioned overlay card, so the shell must apply them to its own
 * root rather than a wrapper.
 */
export function MobilePanelCard({
  title,
  expanded,
  onToggleExpand,
  panelStyle,
  panelRef,
  gap = 'gap-2',
  headerAction,
  children,
}: {
  title: string
  expanded: boolean
  onToggleExpand: () => void
  panelStyle: React.CSSProperties
  panelRef: React.Ref<HTMLDivElement>
  gap?: string
  /** Optional control rendered in the title row, left of the expand toggle. */
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  const { selectedTeam } = useRoster()
  const ToggleIcon = expanded ? Minimize : Maximize

  return (
    <div
      ref={panelRef}
      style={{ ...({ '--primary': selectedTeam.primaryColor } as React.CSSProperties), ...panelStyle }}
      // `relative` + `overflow-hidden` so a panel-scoped overlay (the chat
      // assistant) fills this card and stays inside its rounded corners.
      className={cn('bg-card rounded-xl p-2.5 flex flex-col relative overflow-hidden', gap)}
    >
      <div className="flex items-center justify-between pb-1">
        <span className="text-[12.5px] font-bold">{title}</span>
        <div className="flex items-center gap-2">
          {headerAction}
          <button
            onClick={onToggleExpand}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          >
            <ToggleIcon className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

export function MobileAccordionTrigger({
  label,
  summary,
  open,
  onToggle,
}: {
  label: string
  summary: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between gap-1.5 border-t border-border/60 pt-2">
      <span className="text-[12px] font-semibold flex items-baseline gap-1.5">
        {label}
        <span className="text-[10.5px] font-medium text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight
        className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-90')}
      />
    </button>
  )
}
