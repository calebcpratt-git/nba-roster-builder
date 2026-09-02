// Live population stats for the /data dashboard.
//
// Every number here is computed by walking the real rows at the moment it's
// asked for. Nothing is stored, so a field that starts or stops being
// populated shows up immediately without anyone editing a description — the
// same principle scripts/data-coverage.js follows for its terminal report.

import { DATA_ENTITIES, type EntitySpec, type FieldSpec, type FieldSourceRelation } from './data-schema'

/**
 * Whether a scraped value counts as present. Empty arrays and objects are
 * absent rather than populated: `heldTPEs: []` means this team holds no trade
 * exceptions, which is the same signal as the field not being there at all.
 */
export function isPopulated(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (value instanceof Date) return true
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}

export interface FieldCoverage {
  path: string
  type: string
  description: string
  sources: string[]
  sourceRelation?: FieldSourceRelation
  derived?: string
  expectedEmpty?: string
  populated: number
  total: number
  /** 0-100, rounded. 0 when there are no rows at all. */
  pct: number
  /** A few real values, for showing what the field actually looks like. */
  samples: string[]
}

const MAX_SAMPLES = 3
const MAX_SAMPLE_CHARS = 120

function formatSample(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const json = JSON.stringify(value)
    return json.length > MAX_SAMPLE_CHARS ? `${json.slice(0, MAX_SAMPLE_CHARS)}…` : json
  } catch {
    return String(value)
  }
}

export function fieldCoverage<Row>(entity: EntitySpec<Row>, field: FieldSpec<Row>): FieldCoverage {
  const rows = entity.rows()
  let populated = 0
  const samples: string[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    let value: unknown
    try {
      value = field.get(row)
    } catch {
      // A get() that throws means the row shape drifted from the manifest.
      // Treat it as absent — check-schema-drift.ts is what reports it loudly.
      continue
    }
    if (!isPopulated(value)) continue
    populated++
    if (samples.length < MAX_SAMPLES) {
      const formatted = formatSample(value)
      if (!seen.has(formatted)) {
        seen.add(formatted)
        samples.push(formatted)
      }
    }
  }

  return {
    path: field.path,
    type: field.type,
    description: field.description,
    sources: field.sources,
    sourceRelation: field.sourceRelation,
    derived: field.derived,
    expectedEmpty: field.expectedEmpty,
    populated,
    total: rows.length,
    pct: rows.length === 0 ? 0 : Math.round((100 * populated) / rows.length),
    samples,
  }
}

export interface EntityCoverage {
  id: string
  label: string
  file: string
  description: string
  relationships: string[]
  rowCount: number
  /** Fields with at least one populated value, over fields declared. */
  fieldsPopulated: number
  fieldsDeclared: number
  /** Every source id feeding any field on this entity. */
  sources: string[]
  fields: FieldCoverage[]
}

export function entityCoverage(entity: EntitySpec<any>): EntityCoverage {
  const fields = entity.fields.map((f) => fieldCoverage(entity, f))
  const sources = [...new Set(entity.fields.flatMap((f) => f.sources))]

  return {
    id: entity.id,
    label: entity.label,
    file: entity.file,
    description: entity.description,
    relationships: entity.relationships ?? [],
    rowCount: entity.rows().length,
    fieldsPopulated: fields.filter((f) => f.populated > 0).length,
    fieldsDeclared: fields.length,
    sources,
    fields,
  }
}

export function allEntityCoverage(): EntityCoverage[] {
  return DATA_ENTITIES.map(entityCoverage)
}

export interface SchemaTotals {
  entities: number
  rows: number
  fieldsDeclared: number
  fieldsPopulated: number
  /** Declared fields with no source attributed at all — open pipeline gaps. */
  fieldsWithoutSource: number
}

export function schemaTotals(coverage: EntityCoverage[]): SchemaTotals {
  return {
    entities: coverage.length,
    rows: coverage.reduce((sum, e) => sum + e.rowCount, 0),
    fieldsDeclared: coverage.reduce((sum, e) => sum + e.fieldsDeclared, 0),
    fieldsPopulated: coverage.reduce((sum, e) => sum + e.fieldsPopulated, 0),
    fieldsWithoutSource: coverage.reduce(
      (sum, e) => sum + e.fields.filter((f) => f.sources.length === 0).length,
      0
    ),
  }
}

/** Which entity.field paths a given source feeds — the inverse of the manifest. */
export function fieldsBySource(): Record<string, { entityId: string; entityLabel: string; path: string }[]> {
  const bySource: Record<string, { entityId: string; entityLabel: string; path: string }[]> = {}
  for (const entity of DATA_ENTITIES) {
    for (const field of entity.fields) {
      for (const sourceId of field.sources) {
        ;(bySource[sourceId] ??= []).push({
          entityId: entity.id,
          entityLabel: entity.label,
          path: field.path,
        })
      }
    }
  }
  return bySource
}

/**
 * Key paths present on an entity's real rows that no FieldSpec describes —
 * the drift signal check-schema-drift.ts fails CI on.
 *
 * The manifest itself decides where to descend. A record keyed by data
 * (`salary` by season, `incentives` by season) is declared as a single leaf
 * path and checked as a whole; a structural nested object is declared as
 * `acquisition.date` / `acquisition.method`, and that dot is the cue to look
 * inside. Without the cue, a season-keyed record would report one bogus
 * "undeclared field" per season.
 */
export function undeclaredPaths(entity: EntitySpec<any>): string[] {
  const declared = new Set(entity.fields.map((f) => f.path))
  const descendInto = new Set(
    entity.fields
      .filter((f) => f.path.includes('.'))
      .map((f) => f.path.split('.')[0])
  )
  const undeclared = new Set<string>()

  for (const row of entity.rows()) {
    if (row === null || typeof row !== 'object') continue

    for (const [key, value] of Object.entries(row)) {
      if (descendInto.has(key)) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
        for (const nestedKey of Object.keys(value)) {
          const path = `${key}.${nestedKey}`
          if (!declared.has(path)) undeclared.add(path)
        }
        continue
      }
      if (!declared.has(key)) undeclared.add(key)
    }
  }

  return [...undeclared].sort()
}
