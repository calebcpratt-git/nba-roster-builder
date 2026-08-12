'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Filter, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface NestedField {
  key: string
  values: (string | null)[]
  /** Recurses for shapes like `Record<Season, SeasonGuarantee>` — a season level, then a status/amount/guaranteeDate level under each season. */
  nested?: NestedField[]
}

export interface RowColumn {
  path: string
  /** Pre-extracted so the client never has to re-run the manifest's get(). */
  values: (string | null)[]
  /**
   * For fields shaped like `Record<string, X>` (salary, options, guarantees, …):
   * one sub-column per key, so "2026-27", "2027-28", etc. can each carry their
   * own filter instead of only matching against the field's flattened JSON.
   */
  nested?: NestedField[]
}

interface Props {
  columns: RowColumn[]
  keys: string[]
  /** Full JSON of each row, for the expanded view. */
  raw: string[]
}

const PAGE_SIZE = 100
const ENUM_MAX_VALUES = 30
/** At or below this many distinct non-blank values, a value picker alone is enough — no need for a text search box too. */
const ENUM_SEARCH_THRESHOLD = 5
const BLANK = '(blank)'

type BlankMode = 'any' | 'present' | 'blank'

interface ColumnFilter {
  text: string
  dateAfter: string
  dateBefore: string
  numMin: string
  numMax: string
  /** undefined = no restriction. Only meaningful for enum columns. */
  selected: Set<string> | undefined
  /** Whether this node's own (possibly whole-field) value is present/blank — the one control kept at a parent level once its per-key breakdown replaces the rest. */
  blank: BlankMode
  /** Per nested key (e.g. per season), keyed the same as the matching NestedField's `key`. */
  nested: Record<string, ColumnFilter>
}

function emptyFilter(): ColumnFilter {
  return {
    text: '',
    dateAfter: '',
    dateBefore: '',
    numMin: '',
    numMax: '',
    selected: undefined,
    blank: 'any',
    nested: {},
  }
}

function isFilterActive(f: ColumnFilter | undefined): boolean {
  if (!f) return false
  const ownActive =
    f.text.trim() !== '' ||
    f.dateAfter !== '' ||
    f.dateBefore !== '' ||
    f.numMin !== '' ||
    f.numMax !== '' ||
    f.blank !== 'any' ||
    f.selected !== undefined
  if (ownActive) return true
  return Object.values(f.nested).some(isFilterActive)
}

/** Whether a single (already-stringified) cell value satisfies one field's filter — not counting its nested keys. */
function matchesFilter(value: string | null, f: ColumnFilter, meta: ColumnMeta): boolean {
  if (f.blank === 'blank' && value !== null) return false
  if (f.blank === 'present' && value === null) return false

  const text = f.text.trim().toLowerCase()
  if (text && !(value ?? '').toLowerCase().includes(text)) return false

  if (f.dateAfter || f.dateBefore) {
    if (!value) return false
    const t = Date.parse(value)
    if (Number.isNaN(t)) return false
    if (f.dateAfter && t < Date.parse(f.dateAfter)) return false
    if (f.dateBefore && t > Date.parse(f.dateBefore) + 24 * 60 * 60 * 1000 - 1) return false
  }

  if (f.numMin !== '' || f.numMax !== '') {
    if (value === null || value.trim() === '') return false
    const n = Number(value)
    if (Number.isNaN(n)) return false
    if (f.numMin !== '' && n < Number(f.numMin)) return false
    if (f.numMax !== '' && n > Number(f.numMax)) return false
  }

  if (f.selected) {
    const bucket = value === null ? BLANK : value
    if (!f.selected.has(bucket)) return false
  }

  return true
}

/** Whether a row satisfies a field's filter and, recursively, all of its nested keys' filters. */
function matchesNode(i: number, node: { values: (string | null)[]; nested?: NestedField[] }, f: ColumnFilter, meta: ColumnMeta): boolean {
  if (!matchesFilter(node.values[i], f, meta)) return false

  for (const n of node.nested ?? []) {
    const nf = f.nested[n.key]
    if (!nf || !isFilterActive(nf)) continue
    const nMeta = meta.nested?.find((x) => x.key === n.key)?.meta
    if (!nMeta || !matchesNode(i, n, nf, nMeta)) return false
  }

  return true
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/

interface ColumnMeta {
  isDate: boolean
  isNumeric: boolean
  enumValues: string[] | null
  nested?: { key: string; meta: ColumnMeta }[]
}

function computeOwnMeta(values: (string | null)[]): Omit<ColumnMeta, 'nested'> {
  const nonNull = values.filter((v): v is string => v !== null)
  const isDate =
    nonNull.length > 0 &&
    nonNull.filter((v) => DATE_RE.test(v) && !Number.isNaN(Date.parse(v))).length / nonNull.length > 0.8

  if (isDate) return { isDate: true, isNumeric: false, enumValues: null }

  const isNumeric =
    nonNull.length > 0 &&
    nonNull.filter((v) => v.trim() !== '' && Number.isFinite(Number(v))).length / nonNull.length > 0.8

  // Numeric fields always get a min/max range filter, never a value picker —
  // even when the data happens to have few unique values (e.g. percentages).
  if (isNumeric) return { isDate: false, isNumeric: true, enumValues: null }

  const uniq = Array.from(new Set(values.map((v) => (v === null ? BLANK : v))))
  const enumValues = uniq.length > 0 && uniq.length <= ENUM_MAX_VALUES ? uniq.sort((a, b) => a.localeCompare(b)) : null

  return { isDate: false, isNumeric: false, enumValues }
}

function computeFullMeta(node: { values: (string | null)[]; nested?: NestedField[] }): ColumnMeta {
  const own = computeOwnMeta(node.values)
  if (!node.nested || node.nested.length === 0) return own
  return { ...own, nested: node.nested.map((n) => ({ key: n.key, meta: computeFullMeta(n) })) }
}

export function EntityRowsTable({ columns, keys, raw }: Props) {
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({})

  const columnMeta = useMemo(() => {
    const meta: Record<string, ColumnMeta> = {}
    for (const c of columns) meta[c.path] = computeFullMeta(c)
    return meta
  }, [columns])

  function setFilter(path: string, next: ColumnFilter) {
    setFilters((prev) => ({ ...prev, [path]: next }))
    setLimit(PAGE_SIZE)
  }

  function clearFilter(path: string) {
    setFilters((prev) => {
      const { [path]: _, ...rest } = prev
      return rest
    })
    setLimit(PAGE_SIZE)
  }

  const indices = useMemo(() => {
    const q = query.trim().toLowerCase()
    let idx = keys.map((_, i) => i)

    if (q) {
      idx = idx.filter((i) => {
        if (keys[i].toLowerCase().includes(q)) return true
        return columns.some((c) => (c.values[i] ?? '').toLowerCase().includes(q))
      })
    }

    for (const col of columns) {
      const f = filters[col.path]
      if (!isFilterActive(f)) continue
      const meta = columnMeta[col.path]
      idx = idx.filter((i) => matchesNode(i, col, f, meta))
    }

    if (sortCol) {
      const col = columns.find((c) => c.path === sortCol)
      if (col) {
        idx = [...idx].sort((a, b) => {
          const av = col.values[a] ?? ''
          const bv = col.values[b] ?? ''
          // Sort numerically when both sides parse as numbers, so salary
          // columns don't order as "1000000" < "9" the way strings would.
          const an = Number(av)
          const bn = Number(bv)
          const cmp =
            av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn)
              ? an - bn
              : av.localeCompare(bv)
          return sortDir === 'asc' ? cmp : -cmp
        })
      }
    }

    return idx
  }, [query, sortCol, sortDir, columns, keys, filters, columnMeta])

  function toggleSort(path: string) {
    if (sortCol === path) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(path)
      setSortDir('asc')
    }
  }

  const visible = indices.slice(0, limit)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE_SIZE)
          }}
          placeholder="Search any column…"
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          {indices.length.toLocaleString()} of {keys.length.toLocaleString()} rows
          {visible.length < indices.length && ` · showing ${visible.length.toLocaleString()}`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Key
              </th>
              {columns.map((c) => {
                const meta = columnMeta[c.path]
                const active = isFilterActive(filters[c.path])
                return (
                  <th
                    key={c.path}
                    className="whitespace-nowrap bg-muted px-3 py-2 text-left font-mono text-[11px] font-semibold text-muted-foreground"
                  >
                    <div className="flex items-center gap-1">
                      <span
                        onClick={() => toggleSort(c.path)}
                        className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
                      >
                        {c.path}
                        {sortCol === c.path &&
                          (sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </span>
                      <ColumnFilterPopover
                        path={c.path}
                        meta={meta}
                        filter={filters[c.path] ?? emptyFilter()}
                        active={active}
                        onChange={(next) => setFilter(c.path, next)}
                        onClear={() => clearFilter(c.path)}
                      />
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr
                key={i}
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="cursor-pointer border-t hover:bg-accent"
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 font-medium">{keys[i]}</td>
                {columns.map((c) => (
                  <td key={c.path} className="max-w-[22rem] truncate px-3 py-1.5 tabular-nums text-muted-foreground">
                    {c.values[i] ?? <span className="opacity-40">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-muted-foreground">
                  No rows match the current search and filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {visible.length < indices.length && (
        <button
          onClick={() => setLimit((l) => l + PAGE_SIZE * 5)}
          className="w-full rounded-lg border py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          Show more
        </button>
      )}

      {expanded !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setExpanded(null)}
        >
          <div
            className="relative max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setExpanded(null)}
              className="absolute right-4 top-4 rounded-md border p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            <h3 className="mb-3 pr-8 font-semibold">{keys[expanded]}</h3>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs">
              {raw[expanded]}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

/** The Contains/date/numeric/enum controls for one leaf field — reused for a top-level column with no per-key breakdown, and for each innermost nested key. */
function FieldFilterControls({
  meta,
  filter,
  onChange,
}: {
  meta: ColumnMeta
  filter: ColumnFilter
  onChange: (next: ColumnFilter) => void
}) {
  // A handful of options is enough to just pick from — a search box on top is
  // redundant once there are only a few to scan.
  const enumOnly = meta.enumValues && meta.enumValues.filter((v) => v !== BLANK).length <= ENUM_SEARCH_THRESHOLD
  const showSearch = !meta.isDate && !meta.isNumeric && !enumOnly

  return (
    <div className="space-y-3">
      {showSearch && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Contains</label>
          <Input
            value={filter.text}
            onChange={(e) => onChange({ ...filter, text: e.target.value })}
            placeholder="Search…"
            className="h-8 text-xs"
          />
        </div>
      )}

      {meta.isDate && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground">Date range</label>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filter.dateAfter}
              onChange={(e) => onChange({ ...filter, dateAfter: e.target.value })}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <span className="text-[11px] text-muted-foreground">to</span>
            <input
              type="date"
              value={filter.dateBefore}
              onChange={(e) => onChange({ ...filter, dateBefore: e.target.value })}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Leave "to" empty for on/after only, "from" empty for on/before only.
          </p>
        </div>
      )}

      {meta.isNumeric && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground">Value range</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={filter.numMin}
              onChange={(e) => onChange({ ...filter, numMin: e.target.value })}
              placeholder="Min"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <span className="text-[11px] text-muted-foreground">to</span>
            <input
              type="number"
              value={filter.numMax}
              onChange={(e) => onChange({ ...filter, numMax: e.target.value })}
              placeholder="Max"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Leave "Max" empty for greater-than-or-equal only, "Min" empty for less-than-or-equal only.
          </p>
        </div>
      )}

      {meta.enumValues && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground">Values</label>
            <div className="flex gap-2 text-[11px]">
              <button
                className="text-primary hover:underline"
                onClick={() => onChange({ ...filter, selected: new Set(meta.enumValues!) })}
              >
                Select all
              </button>
              <button className="text-primary hover:underline" onClick={() => onChange({ ...filter, selected: new Set() })}>
                Deselect
              </button>
            </div>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1.5">
            {meta.enumValues.map((v) => {
              const checked = filter.selected ? filter.selected.has(v) : true
              return (
                <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => {
                      const base = filter.selected ? new Set(filter.selected) : new Set(meta.enumValues!)
                      if (c) base.add(v)
                      else base.delete(v)
                      onChange({ ...filter, selected: base })
                    }}
                  />
                  <span className="truncate font-mono">{v}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Present/blank toggle for a field that has its own per-key breakdown — the one whole-field control kept once Contains/range/values move down a level. */
function BlankModeControl({ filter, onChange }: { filter: ColumnFilter; onChange: (next: ColumnFilter) => void }) {
  const options: { mode: BlankMode; label: string }[] = [
    { mode: 'any', label: 'All' },
    { mode: 'present', label: 'Has value' },
    { mode: 'blank', label: 'Blank only' },
  ]
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-muted-foreground">Blank rows</label>
      <div className="flex gap-1">
        {options.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => onChange({ ...filter, blank: mode })}
            className={`flex-1 rounded-md border px-1.5 py-1 text-[11px] ${
              filter.blank === mode
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Renders one field's filter body: leaf controls if it has no per-key breakdown, otherwise the blank toggle plus a recursive list of its nested keys. */
function FilterNodeBody({
  meta,
  filter,
  onChange,
}: {
  meta: ColumnMeta
  filter: ColumnFilter
  onChange: (next: ColumnFilter) => void
}) {
  const hasChildren = !!meta.nested && meta.nested.length > 0

  if (!hasChildren) {
    return <FieldFilterControls meta={meta} filter={filter} onChange={onChange} />
  }

  return (
    <div className="space-y-3">
      <BlankModeControl filter={filter} onChange={onChange} />
      <div className="space-y-1.5 border-t pt-2">
        <label className="block text-[11px] font-medium text-muted-foreground">By key ({meta.nested!.length})</label>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {meta.nested!.map(({ key, meta: nMeta }) => (
            <NestedFilterRow
              key={key}
              nestedKey={key}
              meta={nMeta}
              filter={filter.nested[key] ?? emptyFilter()}
              onChange={(next) => onChange({ ...filter, nested: { ...filter.nested, [key]: next } })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** One collapsible nested-key row (e.g. a single season within a salary column, or a status/amount/guaranteeDate row within a season of guarantees). */
function NestedFilterRow({
  nestedKey,
  meta,
  filter,
  onChange,
}: {
  nestedKey: string
  meta: ColumnMeta
  filter: ColumnFilter
  onChange: (next: ColumnFilter) => void
}) {
  const active = isFilterActive(filter)
  return (
    <details className="group rounded-md border" open={active}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-1 px-2 py-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <ChevronDown className="size-3 text-muted-foreground transition-transform group-open:rotate-180" />
          <span className="font-mono">{nestedKey}</span>
        </span>
        {active && <span className="size-1.5 rounded-full bg-primary" />}
      </summary>
      <div className="border-t p-2">
        <FilterNodeBody meta={meta} filter={filter} onChange={onChange} />
      </div>
    </details>
  )
}

function ColumnFilterPopover({
  path,
  meta,
  filter,
  active,
  onChange,
  onClear,
}: {
  path: string
  meta: ColumnMeta
  filter: ColumnFilter
  active: boolean
  onChange: (next: ColumnFilter) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label={`Filter ${path}`}
          className={`relative rounded p-0.5 hover:bg-accent hover:text-foreground ${active ? 'text-primary' : ''}`}
        >
          <Filter className="size-3" />
          {active && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={`${meta.nested ? 'w-80' : 'w-64'} normal-case tracking-normal text-foreground`}
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold">{path}</p>
            {active && (
              <button
                onClick={() => {
                  onClear()
                  setOpen(false)
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          <FilterNodeBody meta={meta} filter={filter} onChange={onChange} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
