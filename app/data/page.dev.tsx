// Local-only data dashboard. This file is named `page.dev.tsx` and `dev.tsx`
// is only a page extension outside production (see next.config.mjs), so this
// route does not exist in the deployed app.

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { DATA_SOURCES, getEntity, erdEdges, erdTiers } from '@/lib/data-schema'
import { allEntityCoverage, fieldsBySource } from '@/lib/schema-coverage'
import { readScrapeStatus, readDriftReport } from '@/lib/schema-dashboard'
import { SOURCE_STYLES, sourceFamily, familyColor, FAMILY_LABELS, type SourceFamily } from '@/components/data-dashboard/source-styles'
import { RefreshButton } from '@/components/data-dashboard/refresh-button'
import { SourceDataProvider } from '@/components/data-dashboard/source-context'
import { ErdCanvas } from '@/components/data-dashboard/erd-canvas'

export const dynamic = 'force-dynamic'

function timeAgo(iso: string | null): string {
  if (!iso) return 'unknown'
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function unresolvedRecordLabel(category: string, record: Record<string, unknown>): string {
  switch (category) {
    case 'draft-year':
      return `${record.name} (${record.team})`
    case 'acquisition':
      return `${record.name} — ${record.method}, ${record.date}`
    case 'guarantees':
      return `${record.player} (${record.team}) — ${record.status} guarantee, ${record.guaranteeDate}`
    case 'signing':
      return `${record.name} (${record.team}) — ${record.reason}`
    default:
      return Object.entries(record)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
  }
}

export default function DataSchemaDashboard() {
  const coverage = allEntityCoverage()
  const status = readScrapeStatus()
  const drift = readDriftReport()
  const bySource = fieldsBySource()

  const asOf = status.generatedAt ?? status.filesTouchedAt
  const families = [...new Set(Object.keys(DATA_SOURCES).map(sourceFamily))] as SourceFamily[]

  const tiers = erdTiers()
  const edges = erdEdges()
  const erdEntities = coverage.map((c) => ({
    id: c.id,
    label: c.label,
    file: c.file,
    rowCount: c.rowCount,
    primaryKey: getEntity(c.id)?.primaryKey,
    tier: tiers[c.id] ?? 0,
    fields: c.fields.map((f) => ({
      path: f.path,
      type: f.type,
      sources: f.sources,
      derived: f.derived,
      populated: f.populated,
      total: f.total,
    })),
  }))

  return (
    <div className="ds-scope min-h-screen bg-background text-foreground">
      <style>{SOURCE_STYLES}</style>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Data schema &amp; sources</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every entity in the app&rsquo;s data model, the web page behind each field, and how much of it is
              actually populated right now. Population is computed live from the generated files on every load —
              nothing here is a stored claim.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <RefreshButton />
            <div className="text-right text-xs text-muted-foreground">
              <p>
                Data as of <span className="font-medium text-foreground">{timeAgo(asOf)}</span>
                {asOf && ` · ${new Date(asOf).toLocaleString()}`}
              </p>
              <p className="mt-0.5">
                {drift
                  ? `Schema drift checked ${timeAgo(drift.checkedAt)} — ${drift.findings.length} finding${drift.findings.length === 1 ? '' : 's'}.`
                  : 'Schema drift not yet checked — run node scripts/check-schema-drift.js.'}
              </p>
            </div>
          </div>
        </header>

        {/* --- Last scrape ------------------------------------------------ */}
        <section className="mb-8">
          <h2 className="mb-3 border-b pb-1.5 text-sm font-bold uppercase tracking-wide">Last scrape</h2>

          {status.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>{status.error}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {status.clean ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="size-3.5" /> Clean run
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                    <AlertTriangle className="size-3.5" /> Needs review
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {status.written.length} scrape groups written
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-card p-3">
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Diff against yesterday
                  </h3>
                  {status.diffSummaries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No diff recorded.</p>
                  ) : (
                    <ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
                      {status.diffSummaries.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border bg-card p-3">
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Unmatched records — backlog and change
                  </h3>
                  {status.unresolved.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {status.unresolved.map((u) => (
                        <li key={u.category}>
                          <details>
                            <summary className="cursor-pointer font-mono text-xs">
                              {u.category}: {u.after}
                              {u.delta !== 0 && (
                                <span
                                  className={
                                    u.delta > 0 ? 'ml-1.5 font-semibold text-destructive' : 'ml-1.5 text-success'
                                  }
                                >
                                  {u.delta > 0 ? `+${u.delta}` : u.delta} this run
                                </span>
                              )}
                            </summary>
                            {u.records.length > 0 ? (
                              <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto border-l-2 pl-2 font-mono text-[11px] text-muted-foreground">
                                {u.records.map((r, i) => (
                                  <li key={i}>{unresolvedRecordLabel(u.category, r)}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                No record detail on disk for this category.
                              </p>
                            )}
                          </details>
                          <p className="text-[11px] leading-snug text-muted-foreground">{u.meaning}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] leading-snug text-foreground">
                    Each total is a standing backlog — only the per-run change means anything.
                  </p>
                </div>
              </div>

              {(status.staleSources.length > 0 || status.warnings.length > 0) && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  {status.staleSources.length > 0 && (
                    <p className="text-sm">
                      <span className="font-semibold text-destructive">Stale sources (kept last-good data): </span>
                      {status.staleSources.join(', ')}
                    </p>
                  )}
                  {status.warnings.map((w) => (
                    <p key={w} className="text-sm text-destructive">
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* --- Entity relationships (ERD) ----------------------------------- */}
        <section>
          <h2 className="mb-3 border-b pb-1.5 text-sm font-bold uppercase tracking-wide">Entity relationships</h2>
          <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
            Every entity and field in the schema, connected by the identifying fields that join them — a foreign key
            points at the field it references. Click a field&rsquo;s source name to see everything that page
            populates and open it.
          </p>

          <div className="mb-4 flex flex-wrap gap-3">
            {families.map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-full" style={{ background: familyColor(f) }} />
                {FAMILY_LABELS[f]}
              </span>
            ))}
          </div>

          <SourceDataProvider sources={DATA_SOURCES} feeds={bySource}>
            <ErdCanvas entities={erdEntities} edges={edges} />
          </SourceDataProvider>
        </section>

        <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
          Local-only tool — this route is excluded from production builds. Schema and source attribution live in{' '}
          <code className="font-mono">lib/data-schema.ts</code>; population is computed live by{' '}
          <code className="font-mono">lib/schema-coverage.ts</code>.
        </footer>
      </div>
    </div>
  )
}
