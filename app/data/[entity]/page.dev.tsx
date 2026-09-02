import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { getEntity, DATA_ENTITIES, DATA_SOURCES } from '@/lib/data-schema'
import { entityCoverage, fieldsBySource } from '@/lib/schema-coverage'
import { SOURCE_STYLES, CoverageBar } from '@/components/data-dashboard/source-styles'
import { SourceDataProvider } from '@/components/data-dashboard/source-context'
import { SourceBadges } from '@/components/data-dashboard/source-link'
import { EntityRowsTable, type RowColumn } from '@/components/data-dashboard/entity-rows-table'

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return DATA_ENTITIES.map((e) => ({ entity: e.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }) {
  const { entity: entityId } = await params
  const entity = getEntity(entityId)
  return { title: entity ? `${entity.label} - Association GM - Data` : 'Association GM - Data' }
}

/** Flattens a field value to a single searchable, sortable cell string. */
function cellValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length === 0 ? null : JSON.stringify(value)
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    return keys.length === 0 ? null : JSON.stringify(value)
  }
  return String(value)
}

function isKeyedObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Breaks a `Record<string, X>`-shaped field (salary, options, guarantees, …)
 * into one sub-column per key, recursing when a key's own value is itself a
 * keyed object — e.g. guarantees is `Record<Season, SeasonGuarantee>`, so this
 * yields a season level and, under each season, a status/amount/guaranteeDate
 * level. Arrays and primitives don't recurse further.
 */
function nestedColumnsFor(rawValues: unknown[]): RowColumn['nested'] {
  const keys = new Set<string>()
  let anyKeyed = false
  for (const v of rawValues) {
    if (isKeyedObject(v)) {
      anyKeyed = true
      for (const k of Object.keys(v)) keys.add(k)
    }
  }
  if (!anyKeyed || keys.size === 0) return undefined

  return Array.from(keys)
    .sort()
    .map((key) => {
      const childRaw = rawValues.map((v) => (isKeyedObject(v) ? v[key] : null))
      return {
        key,
        values: childRaw.map(cellValue),
        nested: nestedColumnsFor(childRaw),
      }
    })
}

export default async function EntityDetail({ params }: { params: Promise<{ entity: string }> }) {
  const { entity: entityId } = await params
  const entity = getEntity(entityId)
  if (!entity) notFound()

  const coverage = entityCoverage(entity)
  const rows = entity.rows()

  const columns: RowColumn[] = entity.fields.map((field) => {
    const rawValues = rows.map((row) => {
      try {
        return field.get(row)
      } catch {
        return null
      }
    })
    return {
      path: field.path,
      values: rawValues.map(cellValue),
      nested: nestedColumnsFor(rawValues),
    }
  })
  const keys = rows.map((row) => {
    try {
      return entity.keyOf(row)
    } catch {
      return '—'
    }
  })
  const raw = rows.map((row) => JSON.stringify(row, null, 2))

  return (
    <div className="ds-scope min-h-screen bg-background text-foreground">
      <style>{SOURCE_STYLES}</style>

      <SourceDataProvider sources={DATA_SOURCES} feeds={fieldsBySource()}>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/data"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All entities
        </Link>

        <header className="mb-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{coverage.label}</h1>
            <span className="text-sm tabular-nums text-muted-foreground">
              {coverage.rowCount.toLocaleString()} row{coverage.rowCount === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{coverage.file}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{coverage.description}</p>

          {coverage.relationships.length > 0 && (
            <ul className="mt-3 space-y-1 border-l-2 border-border pl-3">
              {coverage.relationships.map((r) => (
                <li key={r} className="text-xs leading-snug text-muted-foreground">
                  {r}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 max-w-sm">
            <CoverageBar populated={coverage.fieldsPopulated} total={coverage.fieldsDeclared} />
            <p className="mt-1 text-[11px] text-muted-foreground">fields carrying at least one value</p>
          </div>
        </header>

        {/* --- Fields ------------------------------------------------------ */}
        <section className="mb-9">
          <h2 className="mb-3 border-b pb-1.5 text-sm font-bold uppercase tracking-wide">Fields</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Field</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Populated</th>
                  <th className="px-3 py-2 font-semibold">What it holds</th>
                </tr>
              </thead>
              <tbody>
                {coverage.fields.map((field) => {
                  const isKey = entity.primaryKey?.includes(field.path) ?? false
                  return (
                  <tr key={field.path} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {isKey && <KeyRound className="size-3 shrink-0 text-warning" aria-label="identifying field" />}
                        <span className={`font-mono text-xs ${isKey ? 'font-bold' : 'font-medium'}`}>{field.path}</span>
                      </div>
                      <div className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">
                        {field.type}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <SourceBadges sources={field.sources} derived={field.derived} relation={field.sourceRelation} />
                      {field.derived && (
                        <p className="mt-1 text-[11px] italic text-muted-foreground">{field.derived}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      <span className={field.populated === 0 && !field.expectedEmpty ? 'text-destructive' : ''}>
                        {field.populated.toLocaleString()}/{field.total.toLocaleString()}
                      </span>
                      <span className="ml-1 text-[11px] text-muted-foreground">({field.pct}%)</span>
                      {field.expectedEmpty && (
                        <p className="mt-1 max-w-[16rem] text-[11px] italic text-muted-foreground">
                          {field.expectedEmpty}
                        </p>
                      )}
                      {field.samples.length > 0 && (
                        <div className="mt-1 max-w-[16rem] space-y-0.5">
                          {field.samples.map((s, i) => (
                            <div
                              key={i}
                              className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                              title={s}
                            >
                              {s}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs leading-snug text-muted-foreground">{field.description}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* --- Rows -------------------------------------------------------- */}
        <section>
          <h2 className="mb-3 border-b pb-1.5 text-sm font-bold uppercase tracking-wide">
            Data currently in the schema
          </h2>
          {coverage.rowCount === 0 ? (
            <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
              This entity has no rows in the repo — it is built by the user in the app and stored per account, so
              there is nothing for the pipeline to populate.
            </p>
          ) : (
            <EntityRowsTable columns={columns} keys={keys} raw={raw} />
          )}
        </section>
      </div>
      </SourceDataProvider>
    </div>
  )
}
