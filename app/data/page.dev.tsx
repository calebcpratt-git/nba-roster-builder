// Local-only data dashboard. This file is named `page.dev.tsx` and `dev.tsx`
// is only a page extension outside production (see next.config.mjs), so this
// route does not exist in the deployed app.

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { DATA_SOURCES, getEntity, erdEdges, erdTiers } from '@/lib/data-schema'
import { allEntityCoverage, fieldsBySource } from '@/lib/schema-coverage'
import { readScrapeStatus, readSchemaChangeLog, readPendingScrapeRun, readLatestWorkflowRun } from '@/lib/schema-dashboard'
import { SOURCE_STYLES, sourceFamily, familyColor, FAMILY_LABELS, type SourceFamily } from '@/components/data-dashboard/source-styles'
import { RefreshButton } from '@/components/data-dashboard/refresh-button'
import { RescueButton } from '@/components/data-dashboard/rescue-button'
import { DataChatPanel } from '@/components/data-dashboard/chat-panel'
import { SourceDataProvider } from '@/components/data-dashboard/source-context'
import { SourceLink } from '@/components/data-dashboard/source-link'
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

function formatFieldValue(v: unknown): string {
  if (v === undefined) return '(none)'
  if (v === null) return 'null'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function diffRecordLabel(kind: string, record: Record<string, unknown>): string {
  switch (kind) {
    case 'players':
    case 'contract-details':
      return String(record.name)
    case 'free-agents':
      return `${record.name} (${record.priorTeam})`
    case 'draft-picks':
      return `${record.teamOwner} ${record.year} ${record.round}${record.teamFrom ? ` via ${record.teamFrom}` : ''}`
    case 'team-cap-state':
      return `${record.team} — ${record.season}`
    default:
      return Object.entries(record)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
  }
}

export default function DataSchemaDashboard() {
  const coverage = allEntityCoverage()
  const status = readScrapeStatus()
  const pendingRun = readPendingScrapeRun()
  const latestRun = readLatestWorkflowRun()
  const schemaChanges = readSchemaChangeLog()
  const lastSchemaChange = schemaChanges[0] ?? null
  const bySource = fieldsBySource()

  const asOf = status.generatedAt ?? status.filesTouchedAt
  const families = [...new Set(Object.keys(DATA_SOURCES).map(sourceFamily))] as SourceFamily[]

  const sourceFetchRows = Object.values(DATA_SOURCES)
    .filter((s): s is typeof s & { runPyKey: string } => !!s.runPyKey)
    .map((s) => ({
      id: s.id,
      runPyKey: s.runPyKey,
      ok: status.sourceFetches ? status.sourceFetches[s.runPyKey] !== false : null,
    }))

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

      <SourceDataProvider sources={DATA_SOURCES} feeds={bySource}>
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
            <div className="flex items-center gap-2">
              <DataChatPanel />
              <RefreshButton />
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                Data as of <span className="font-medium text-foreground">{timeAgo(asOf)}</span>
                {asOf && ` · ${new Date(asOf).toLocaleString()}`}
              </p>
              {lastSchemaChange ? (
                <details className="mt-0.5">
                  <summary className="cursor-pointer">
                    Schema last changed <span className="font-medium text-foreground">{timeAgo(lastSchemaChange.date)}</span>
                  </summary>
                  <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto border-l-2 pl-2 text-left font-mono text-[11px] text-muted-foreground">
                    {schemaChanges.map((c) => (
                      <li key={c.hash}>
                        {new Date(c.date).toLocaleDateString()} — {c.subject}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p className="mt-0.5">No history found for lib/data-schema.ts.</p>
              )}
            </div>
          </div>
        </header>

        {/* --- Pipeline status: is there a scrape run not yet on main? ----- */}
        {pendingRun === 'unknown' || latestRun === 'unknown' ? (
          <div className="mb-8 flex items-start gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Couldn&rsquo;t check GitHub for pending or failed scrape runs (<code className="font-mono">gh</code> not
              available or not authenticated) — this dashboard is only showing what&rsquo;s committed locally.
            </p>
          </div>
        ) : pendingRun ? (
          <div className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="font-semibold text-amber-700 dark:text-amber-500">
                  Today&rsquo;s scrape is open for review, not on main —{' '}
                  <a href={pendingRun.url} target="_blank" rel="noreferrer" className="underline">
                    PR #{pendingRun.number}
                  </a>{' '}
                  ({timeAgo(pendingRun.createdAt)})
                </p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Why it didn&rsquo;t auto-merge</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-snug text-muted-foreground">
                    {pendingRun.body}
                  </pre>
                </details>
              </div>
            </div>
          </div>
        ) : latestRun?.conclusion === 'failure' ? (
          <div className="mb-8 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>
              The latest scheduled scrape run failed before it could open a PR —{' '}
              <a href={latestRun.url} target="_blank" rel="noreferrer" className="font-semibold underline">
                see the run
              </a>{' '}
              ({timeAgo(latestRun.createdAt)}).
            </p>
          </div>
        ) : null}

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

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-card p-3">
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Diff against yesterday
                  </h3>
                  {status.diffs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No diff recorded.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {status.diffs.map((d) => {
                        const hasDetail = d.added.length > 0 || d.removed.length > 0 || d.changed.length > 0
                        return (
                          <li key={d.kind}>
                            <details>
                              <summary
                                className={
                                  'font-mono text-xs text-muted-foreground' +
                                  (hasDetail ? ' cursor-pointer' : '')
                                }
                              >
                                {d.summary}
                              </summary>
                              {hasDetail ? (
                                <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto border-l-2 pl-2 font-mono text-[11px] text-muted-foreground">
                                  {d.added.map((r, i) => (
                                    <li key={`a${i}`} className="text-success">
                                      + {diffRecordLabel(d.kind, r)}
                                    </li>
                                  ))}
                                  {d.removed.map((r, i) => (
                                    <li key={`r${i}`} className="text-destructive">
                                      − {diffRecordLabel(d.kind, r)}
                                    </li>
                                  ))}
                                  {d.changed.map((c, i) => (
                                    <li key={`c${i}`}>
                                      <details>
                                        <summary className="cursor-pointer">
                                          ~ {diffRecordLabel(d.kind, c.after)}{' '}
                                          <span className="text-foreground/70">({c.fields.join(', ')})</span>
                                        </summary>
                                        <ul className="mt-0.5 space-y-0.5 border-l-2 pl-2">
                                          {c.fields.map((field) => (
                                            <li key={field}>
                                              <span className="text-foreground/70">{field}:</span>{' '}
                                              <span className="text-destructive line-through">
                                                {formatFieldValue(c.before[field])}
                                              </span>{' '}
                                              <span className="text-success">{formatFieldValue(c.after[field])}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </details>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  No record detail on disk for this kind.
                                </p>
                              )}
                            </details>
                          </li>
                        )
                      })}
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
                      {status.unresolved.map((u) => {
                        const newKeys = new Set(u.newRecords.map((r) => JSON.stringify(r)))
                        return (
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
                                {u.records.map((r, i) => {
                                  const isNew = newKeys.has(JSON.stringify(r))
                                  return (
                                    <li
                                      key={i}
                                      className={isNew ? 'rounded bg-destructive/10 px-1 font-semibold text-destructive' : undefined}
                                    >
                                      {unresolvedRecordLabel(u.category, r)}
                                      {isNew && <span className="ml-1 font-normal">— new this run</span>}
                                    </li>
                                  )
                                })}
                              </ul>
                            ) : (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                No record detail on disk for this category.
                              </p>
                            )}
                            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{u.meaning}</p>
                          </details>
                        </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border bg-card p-3">
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Source fetches
                  </h3>
                  {sourceFetchRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No source-fetch detail on disk for this run.</p>
                  ) : (
                    <ul className="space-y-1">
                      {sourceFetchRows.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                          <SourceLink sourceId={s.id} fullLabel />
                          <div className="flex shrink-0 items-center gap-2">
                            {s.ok === null ? (
                              <span className="text-muted-foreground">no data</span>
                            ) : s.ok ? (
                              <span className="font-semibold text-success">scraped</span>
                            ) : (
                              <>
                                <span className="font-semibold text-destructive">failed</span>
                                <RescueButton runPyKey={s.runPyKey} />
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
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

          <ErdCanvas entities={erdEntities} edges={edges} />
        </section>

        <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
          Local-only tool — this route is excluded from production builds. Schema and source attribution live in{' '}
          <code className="font-mono">lib/data-schema.ts</code>; population is computed live by{' '}
          <code className="font-mono">lib/schema-coverage.ts</code>.
        </footer>
      </div>
      </SourceDataProvider>
    </div>
  )
}
