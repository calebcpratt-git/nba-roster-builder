'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipLine {
  /** Optional bold lead-in, e.g. "At/above the first apron:" */
  label?: string
  text: string
}

export interface TooltipContent {
  title: string
  lines: TooltipLine[]
  footer?: string
}

const WIDTH = 262
const GAP = 6
const VIEWPORT_MARGIN = 12

// The popover is positioned before it has rendered, so its height has to be
// predicted rather than measured: a fixed chrome allowance plus a per-line
// estimate, which is what decides whether it flips above the trigger.
function estimateHeight(content: TooltipContent): number {
  return 54 + 44 * content.lines.length + (content.footer ? 34 : 0)
}

interface TooltipState {
  id: string
  content: TooltipContent
  top: number
  left: number
}

interface TooltipHostValue {
  open: (id: string, content: TooltipContent, trigger: DOMRect) => void
  close: (id?: string) => void
  toggle: (id: string, content: TooltipContent, trigger: DOMRect) => void
  openId: string | null
}

const TooltipHostContext = createContext<TooltipHostValue | null>(null)

/**
 * Hosts the one tooltip that can be open at a time.
 *
 * These render `position: fixed` into a portal rather than inside the panel
 * that triggered them — the right-hand panels scroll internally and clip their
 * own overflow, which would otherwise cut the popover off.
 */
export function SpecTooltipHost({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TooltipState | null>(null)

  // The popover is positioned once, from the trigger's rect at open time, so
  // anything that moves the trigger afterwards would leave it stranded —
  // dismiss instead of trying to track. A press anywhere but on a trigger
  // dismisses too; triggers are skipped so their own click still toggles.
  useEffect(() => {
    if (!state) return
    const dismiss = () => setState(null)
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-spec-tooltip-trigger]')) return
      dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [state])

  const place = useCallback((id: string, content: TooltipContent, trigger: DOMRect) => {
    const height = estimateHeight(content)
    const below = trigger.bottom + GAP
    const fitsBelow = below + height <= window.innerHeight
    setState({
      id,
      content,
      top: fitsBelow ? below : Math.max(8, trigger.top - GAP - height),
      left: Math.min(trigger.left, window.innerWidth - WIDTH - VIEWPORT_MARGIN),
    })
  }, [])

  const value = useMemo<TooltipHostValue>(
    () => ({
      openId: state?.id ?? null,
      open: place,
      close: (id?: string) => setState((s) => (!s || !id || s.id === id ? null : s)),
      toggle: (id, content, trigger) =>
        setState((s) => {
          if (s?.id === id) return null
          const height = estimateHeight(content)
          const below = trigger.bottom + GAP
          const fitsBelow = below + height <= window.innerHeight
          return {
            id,
            content,
            top: fitsBelow ? below : Math.max(8, trigger.top - GAP - height),
            left: Math.min(trigger.left, window.innerWidth - WIDTH - VIEWPORT_MARGIN),
          }
        }),
    }),
    [state?.id, place]
  )

  return (
    <TooltipHostContext.Provider value={value}>
      {children}
      {state &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[80] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-2.5"
            style={{ top: state.top, left: state.left, width: WIDTH }}
          >
            <p className="text-[10.5px] font-semibold">{state.content.title}</p>
            <div className="mt-1.5 flex flex-col gap-1">
              {state.content.lines.map((line, i) => (
                <p key={i} className="text-[10.5px] text-muted-foreground leading-relaxed">
                  {line.label && <span className="font-medium text-foreground">{line.label} </span>}
                  {line.text}
                </p>
              ))}
            </div>
            {state.content.footer && (
              <p className="mt-2 pt-2 border-t border-border/60 text-[10px] text-muted-foreground/80 leading-relaxed">
                {state.content.footer}
              </p>
            )}
          </div>,
          document.body
        )}
    </TooltipHostContext.Provider>
  )
}

/**
 * Wraps a trigger so it shows `content` on hover and latches it on click —
 * the click path is what makes the CBA explanations reachable without a mouse
 * hover (and lets a reader move the pointer away to read a long one).
 */
export function SpecTooltipTrigger({
  id,
  content,
  children,
  className,
  as = 'span',
  onClick,
}: {
  id: string
  content: TooltipContent
  children: React.ReactNode
  className?: string
  as?: 'span' | 'button'
  onClick?: () => void
}) {
  const host = useContext(TooltipHostContext)
  const ref = useRef<HTMLElement>(null)

  const rect = () => ref.current?.getBoundingClientRect()

  const handlers = host
    ? {
        onMouseEnter: () => { const r = rect(); if (r) host.open(id, content, r) },
        onMouseLeave: () => host.close(id),
        onClick: () => {
          onClick?.()
          const r = rect()
          if (r) host.toggle(id, content, r)
        },
      }
    : {}

  const Tag = as as 'span'
  return (
    <Tag ref={ref as React.Ref<HTMLSpanElement>} className={className} data-spec-tooltip-trigger="" {...handlers}>
      {children}
    </Tag>
  )
}
