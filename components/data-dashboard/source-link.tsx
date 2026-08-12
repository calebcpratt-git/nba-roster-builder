'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, X } from 'lucide-react'
import { useSourceData } from './source-context'
import { sourceFamily, familyColor } from './source-styles'

/** A field's source, rendered as its label — click it to see every field it
 *  populates and open the source page itself. */
export function SourceLink({ sourceId, fullLabel }: { sourceId: string; fullLabel?: boolean }) {
  const { sources, feeds } = useSourceData()
  const [open, setOpen] = useState(false)
  const source = sources[sourceId]
  const fields = feeds[sourceId] ?? []

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!source) {
    return <span className="text-[11px] text-muted-foreground">{sourceId}</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] text-foreground hover:text-primary hover:underline"
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: familyColor(sourceFamily(sourceId)) }}
        />
        {fullLabel ? source.label : source.label.split('—')[0].trim()}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-md border p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-2 pr-8">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: familyColor(sourceFamily(sourceId)) }}
              />
              <h3 className="font-semibold leading-tight">{source.label}</h3>
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {source.scraper} · {source.cadence}
            </p>

            {source.note && (
              <p className="mt-2 border-l-2 border-warning/60 bg-warning/5 py-1 pl-2 text-xs leading-snug">
                {source.note}
              </p>
            )}

            {source.url ? (
              source.isTemplate ? (
                <div className="mt-3 rounded-lg border bg-muted px-2.5 py-2">
                  <p className="break-all font-mono text-[11px] text-muted-foreground">{source.url}</p>
                  <p className="mt-1 text-[11px] italic text-muted-foreground">
                    A URL template the scraper fills in per team or player — no single page to open.
                  </p>
                </div>
              ) : (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-primary hover:bg-accent"
                >
                  Open source page <ExternalLink className="size-3.5" />
                </a>
              )
            ) : (
              <p className="mt-3 text-xs italic text-muted-foreground">Not a web source.</p>
            )}

            <div className="mt-4 border-t pt-3">
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Feeds {fields.length} field{fields.length === 1 ? '' : 's'}
              </h4>
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No field in the current schema is attributed to this source.
                </p>
              ) : (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs">
                  {fields.map((f) => (
                    <li key={`${f.entityId}.${f.path}`}>
                      <Link
                        href={`/data/${f.entityId}`}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        {f.entityLabel}.{f.path}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** A field's full source list — "calculated" when the value is computed
 *  app-side rather than read from a page, "no source" when it's neither
 *  sourced nor derived (an open pipeline gap), otherwise a SourceLink per
 *  source, dot-separated. */
export function SourceBadges({ sources, derived }: { sources: string[]; derived?: string }) {
  if (sources.length === 0) {
    return (
      <span className="text-[11px] italic text-muted-foreground" title={derived}>
        {derived ? 'calculated' : 'no source'}
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {sources.map((id, i) => (
        <span key={id} className="inline-flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground">·</span>}
          <SourceLink sourceId={id} />
        </span>
      ))}
    </span>
  )
}
