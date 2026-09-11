'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type Phase = 'closed' | 'opening' | 'open' | 'closing'
type Rect = { top: number; left: number; width: number; height: number }

const DURATION_MS = 320
const EASE = 'cubic-bezier(.22,1,.36,1)'
const TRANSITION = (['top', 'left', 'width', 'height'] as const)
  .map((prop) => `${prop} ${DURATION_MS}ms ${EASE}`)
  .join(', ')

/** Insets of the expanded card from its positioned ancestor. */
const SIDE_INSET = 12
const VERTICAL_INSET = 44

/**
 * Grows an inline panel into a near-fullscreen card and back, animating the
 * rectangle itself rather than cross-fading two copies.
 *
 * The panel is measured where it already sits, pinned there as an absolute box
 * for one frame with transitions off, then handed its target rectangle so the
 * browser interpolates between the two — a FLIP, with `top/left/width/height`
 * as the animated properties.
 *
 * The one-frame pin uses a timeout rather than a nested requestAnimationFrame:
 * rAF is throttled while the view isn't foregrounded, which would land both
 * rectangles in the same paint and make the panel jump.
 *
 * The panel positions against its `offsetParent`, so the host must give the
 * container it should fill `position: relative`.
 */
export function useExpandablePanel() {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('closed')
  const [rect, setRect] = useState<Rect | null>(null)
  const [target, setTarget] = useState<Rect | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const expanded = phase !== 'closed'

  const expand = useCallback(() => {
    const el = ref.current
    if (!el) return
    const parent = el.offsetParent as HTMLElement | null
    setRect({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight })
    setTarget(
      parent
        ? {
            top: VERTICAL_INSET,
            left: SIDE_INSET,
            width: parent.offsetWidth - SIDE_INSET * 2,
            height: parent.offsetHeight - VERTICAL_INSET * 2,
          }
        : null
    )
    setPhase('opening')
    timers.current.push(setTimeout(() => setPhase('open'), 30))
  }, [])

  const collapse = useCallback(() => {
    setPhase((p) => (p === 'closed' ? p : 'closing'))
    timers.current.push(
      setTimeout(() => {
        setPhase('closed')
        setRect(null)
        setTarget(null)
      }, DURATION_MS)
    )
  }, [])

  const toggle = useCallback(() => {
    if (phase === 'closed') expand()
    else collapse()
  }, [phase, expand, collapse])

  let panelStyle: CSSProperties = {}
  if (phase !== 'closed' && rect) {
    const base: CSSProperties = {
      position: 'absolute',
      zIndex: 70,
      borderRadius: 14,
      boxShadow: '0 12px 40px rgba(0,0,0,.35)',
      overflowY: 'auto',
      transition: TRANSITION,
    }
    panelStyle =
      phase === 'opening'
        ? { ...base, transition: 'none', ...rect }
        : { ...base, ...(phase === 'open' ? target ?? rect : rect) }
  }

  const backdropStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(15,23,42,.55)',
    zIndex: 65,
    opacity: expanded ? 1 : 0,
    pointerEvents: expanded ? 'auto' : 'none',
    transition: 'opacity 280ms ease',
  }

  return { ref, expanded, panelStyle, backdropStyle, toggle, collapse }
}

// --- desktop variant -------------------------------------------------------

const DESKTOP_DURATION_MS = 300
const DESKTOP_TRANSITION =
  (['top', 'left', 'width', 'height'] as const).map((p) => `${p} ${DESKTOP_DURATION_MS}ms ${EASE}`).join(', ') +
  `, box-shadow ${DESKTOP_DURATION_MS}ms ease`
const DESKTOP_SHADOW = '0 20px 60px rgba(0,0,0,.35)'

/**
 * The desktop counterpart of useExpandablePanel: the panel already fills its
 * wrapper (`position:absolute; inset:0`), and expanding lifts it out to a
 * centered box measured against the viewport rather than an inset card
 * measured against the app container.
 *
 * Same two-phase FLIP — measure, pin fixed at the measured rect for one frame
 * with transitions off, then flip to the target — but positioned `fixed`, so
 * the surrounding column's own scrolling and clipping don't apply.
 */
export function useCenteredPanelExpand({
  maxWidth,
  widthRatio,
  maxHeight,
  heightRatio,
}: {
  maxWidth: number
  widthRatio: number
  maxHeight: number
  heightRatio: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('closed')
  const [rect, setRect] = useState<Rect | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const expanded = phase !== 'closed'

  const target = (): Rect => {
    const width = Math.min(maxWidth, window.innerWidth * widthRatio)
    const height = Math.min(window.innerHeight * heightRatio, maxHeight)
    return { top: (window.innerHeight - height) / 2, left: (window.innerWidth - width) / 2, width, height }
  }

  const toggle = useCallback(() => {
    if (phase === 'closed') {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      setPhase('opening')
      timers.current.push(setTimeout(() => setPhase('open'), 30))
    } else {
      setPhase('closing')
      timers.current.push(
        setTimeout(() => {
          setPhase('closed')
          setRect(null)
        }, DESKTOP_DURATION_MS)
      )
    }
  }, [phase])

  const collapse = useCallback(() => {
    if (phase === 'closed') return
    setPhase('closing')
    timers.current.push(
      setTimeout(() => {
        setPhase('closed')
        setRect(null)
      }, DESKTOP_DURATION_MS)
    )
  }, [phase])

  let panelStyle: CSSProperties = { position: 'absolute', inset: 0 }
  if (phase !== 'closed' && rect) {
    const base: CSSProperties = { position: 'fixed', zIndex: 60, margin: 0, inset: 'auto' }
    panelStyle =
      phase === 'opening'
        ? { ...base, ...rect, transition: 'none', boxShadow: 'none' }
        : phase === 'open'
          ? { ...base, ...target(), transition: DESKTOP_TRANSITION, boxShadow: DESKTOP_SHADOW }
          : { ...base, ...rect, transition: DESKTOP_TRANSITION, boxShadow: 'none' }
  }

  const backdropStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,.55)',
    zIndex: 55,
    opacity: expanded ? 1 : 0,
    pointerEvents: expanded ? 'auto' : 'none',
    transition: 'opacity 260ms ease',
  }

  return { ref, expanded, panelStyle, backdropStyle, toggle, collapse }
}
