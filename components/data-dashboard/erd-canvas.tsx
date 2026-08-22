'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { SourceBadges } from './source-link'
import type { FieldSourceRelation } from '@/lib/data-schema'

export interface ErdField {
  path: string
  type: string
  sources: string[]
  sourceRelation?: FieldSourceRelation
  derived?: string
  populated: number
  total: number
}

export interface ErdEntityData {
  id: string
  label: string
  file: string
  rowCount: number
  primaryKey?: string[]
  tier: number
  fields: ErdField[]
}

export interface ErdEdgeData {
  from: string // entity id
  field: string // FK field path on `from`
  toEntity: string
  toField: string
  label: string
}

interface PathDatum {
  key: string
  d: string
  label: string
  midX: number
  midY: number
  from: string
  to: string
}

function fieldAnchorId(entityId: string, path: string) {
  return `erd-field-${entityId}-${path}`
}
function entityAnchorId(entityId: string) {
  return `erd-entity-${entityId}`
}

function EntityCard({
  entity,
  hovered,
  onHover,
}: {
  entity: ErdEntityData
  hovered: string | null
  onHover: (id: string | null) => void
}) {
  const isHovered = hovered === entity.id
  return (
    <div
      id={entityAnchorId(entity.id)}
      data-erd-card
      onMouseEnter={() => onHover(entity.id)}
      onMouseLeave={() => onHover(null)}
      className={`w-[300px] shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm transition-colors ${
        isHovered ? 'border-primary' : 'border-border'
      }`}
    >
      <div className="border-b bg-muted px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <Link href={`/data/${entity.id}`} className="font-semibold leading-tight hover:text-primary hover:underline">
            {entity.label}
          </Link>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {entity.rowCount.toLocaleString()} row{entity.rowCount === 1 ? '' : 's'}
          </span>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">{entity.file}</p>
      </div>

      <ul className="divide-y">
        {entity.fields.map((field) => {
          const isKey = entity.primaryKey?.includes(field.path) ?? false
          return (
            <li key={field.path} id={fieldAnchorId(entity.id, field.path)} className="px-3 py-1.5">
              <div className="flex items-baseline gap-1.5">
                {isKey ? (
                  <KeyRound className="size-2.5 shrink-0 text-warning" aria-label="identifying field" />
                ) : (
                  <span className="inline-block size-2.5 shrink-0" />
                )}
                <span className={`font-mono text-[11px] ${isKey ? 'font-bold' : ''}`}>{field.path}</span>
                <span
                  className="ml-auto max-w-[130px] truncate font-mono text-[10px] text-muted-foreground"
                  title={field.type}
                >
                  {field.type}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 pl-4">
                <SourceBadges sources={field.sources} derived={field.derived} relation={field.sourceRelation} />
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {field.total === 0 ? '—' : `${field.populated}/${field.total}`}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * A traditional entity-relationship diagram: one card per entity with every
 * field, an identifying-field marker, and a per-field source. Foreign-key
 * fields are connected by an arrow to the field they reference on the
 * target entity — measured from the live DOM after layout, so it stays
 * correct regardless of how tall a card's field list gets.
 */
export function ErdCanvas({ entities, edges }: { entities: ErdEntityData[]; edges: ErdEdgeData[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [paths, setPaths] = useState<PathDatum[]>([])
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })
  const [hovered, setHovered] = useState<string | null>(null)

  const recompute = () => {
    const container = containerRef.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    const next: PathDatum[] = []

    for (const edge of edges) {
      const sourceEl =
        document.getElementById(fieldAnchorId(edge.from, edge.field)) ?? document.getElementById(entityAnchorId(edge.from))
      const targetEl =
        document.getElementById(fieldAnchorId(edge.toEntity, edge.toField)) ??
        document.getElementById(entityAnchorId(edge.toEntity))
      if (!sourceEl || !targetEl) continue

      const sRect = sourceEl.getBoundingClientRect()
      const tRect = targetEl.getBoundingClientRect()
      const sourceIsLeft = sRect.left <= tRect.left

      const x1 = (sourceIsLeft ? sRect.right : sRect.left) - cRect.left + container.scrollLeft
      const y1 = sRect.top + sRect.height / 2 - cRect.top + container.scrollTop
      const x2 = (sourceIsLeft ? tRect.left : tRect.right) - cRect.left + container.scrollLeft
      const y2 = tRect.top + tRect.height / 2 - cRect.top + container.scrollTop

      const pull = Math.max(Math.abs(x2 - x1) * 0.45, 36)
      const c1x = x1 + (sourceIsLeft ? pull : -pull)
      const c2x = x2 + (sourceIsLeft ? -pull : pull)

      next.push({
        key: `${edge.from}.${edge.field}->${edge.toEntity}.${edge.toField}`,
        d: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`,
        label: edge.label,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
        from: edge.from,
        to: edge.toEntity,
      })
    }

    setPaths(next)
    setSvgSize({ w: container.scrollWidth, h: container.scrollHeight })
  }

  useLayoutEffect(() => {
    recompute()
    // Font loading can reflow card heights a tick after first paint.
    const raf = requestAnimationFrame(recompute)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, edges])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => recompute())
    observer.observe(container)
    for (const card of Array.from(container.querySelectorAll('[data-erd-card]'))) observer.observe(card)
    window.addEventListener('resize', recompute)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recompute)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, edges])

  const connectedIds = new Set(edges.flatMap((e) => [e.from, e.toEntity]))
  const graphEntities = entities.filter((e) => connectedIds.has(e.id))
  const standaloneEntities = entities.filter((e) => !connectedIds.has(e.id))
  const tiers = [...new Set(graphEntities.map((e) => e.tier))].sort((a, b) => a - b)

  return (
    <div ref={containerRef} className="relative overflow-auto rounded-lg border bg-card/40" style={{ maxHeight: '82vh' }}>
      <svg width={svgSize.w} height={svgSize.h} className="pointer-events-none absolute left-0 top-0">
        <defs>
          <marker id="erd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-current" />
          </marker>
        </defs>
        {paths.map((p) => {
          const dim = hovered !== null && hovered !== p.from && hovered !== p.to
          const active = hovered !== null && (hovered === p.from || hovered === p.to)
          const labelWidth = p.label.length * 6.2 + 8
          return (
            <g key={p.key} className={active ? 'text-primary' : 'text-muted-foreground'} opacity={dim ? 0.12 : active ? 1 : 0.5}>
              <path d={p.d} fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.25} markerEnd="url(#erd-arrow)" />
              <rect
                x={p.midX - labelWidth / 2}
                y={p.midY - 8}
                width={labelWidth}
                height={16}
                rx={4}
                className="fill-background stroke-border"
                strokeWidth={1}
              />
              <text x={p.midX} y={p.midY + 3.5} textAnchor="middle" className="fill-current font-mono" style={{ fontSize: 10 }}>
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="relative p-6">
        <div className="flex items-start gap-10" style={{ width: 'max-content' }}>
          {tiers.map((tier) => (
            <div key={tier} className="flex flex-col gap-5">
              {graphEntities
                .filter((e) => e.tier === tier)
                .map((entity) => (
                  <EntityCard key={entity.id} entity={entity} hovered={hovered} onHover={setHovered} />
                ))}
            </div>
          ))}
        </div>

        {standaloneEntities.length > 0 && (
          <div className="mt-8 border-t pt-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Reference data — no relationships to other entities
            </p>
            <div className="flex flex-wrap items-start gap-5" style={{ width: 'max-content' }}>
              {standaloneEntities.map((entity) => (
                <EntityCard key={entity.id} entity={entity} hovered={hovered} onHover={setHovered} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
