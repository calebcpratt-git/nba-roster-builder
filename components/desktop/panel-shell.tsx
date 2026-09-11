'use client'

import { useRoster } from '@/lib/roster-context'
import { Maximize, Minimize } from 'lucide-react'

/**
 * The team-colored card both right-column panels sit in.
 *
 * The panel is absolutely positioned inside a `relative` wrapper so it exactly
 * fills its half of the column — and so `useCenteredPanelExpand` has a stable
 * box to measure and lift out of when it expands to the centered modal.
 */
export function DesktopPanelShell({
  title,
  count,
  expanded,
  onToggleExpand,
  panelStyle,
  wrapperRef,
  backdropStyle,
  onBackdropClick,
  headerAction,
  children,
}: {
  title: string
  count: number
  expanded: boolean
  onToggleExpand: () => void
  panelStyle: React.CSSProperties
  wrapperRef: React.Ref<HTMLDivElement>
  backdropStyle: React.CSSProperties
  onBackdropClick: () => void
  /** Optional control rendered in the header bar, left of the expand toggle. */
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  const { selectedTeam } = useRoster()
  const ToggleIcon = expanded ? Minimize : Maximize

  return (
    <>
      <div style={backdropStyle} onClick={onBackdropClick} />
      <div ref={wrapperRef} className="flex-1 min-h-0 relative">
        <div
          // `relative` so a panel-scoped overlay (the chat assistant) resolves
          // to this card's box rather than escaping to the page.
          className="rounded-lg overflow-hidden border bg-card flex flex-col relative"
          style={{
            borderColor: selectedTeam.primaryColor,
            ...({ '--primary': selectedTeam.primaryColor } as React.CSSProperties),
            ...panelStyle,
          }}
        >
          <div
            className="select-none py-2.5 px-3.5 shrink-0"
            style={{ background: selectedTeam.primaryColor }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12.5px] font-semibold flex items-center gap-1.5 whitespace-nowrap text-white">
                {title}
                <span className="font-medium text-white/75">{count}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {headerAction}
                <button
                  onClick={onToggleExpand}
                  className="text-white/80 hover:text-white transition-colors shrink-0"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
                >
                  <ToggleIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </>
  )
}

/** The 9.5px uppercase micro-label that heads each block inside a panel. */
export function PanelBlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground leading-none">{children}</p>
  )
}
