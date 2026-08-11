'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface RowColumn {
  path: string
  /** Pre-extracted so the client never has to re-run the manifest's get(). */
  values: (string | null)[]
}

interface Props {
  columns: RowColumn[]
  keys: string[]
  /** Full JSON of each row, for the expanded view. */
  raw: string[]
}

const PAGE_SIZE = 100

export function EntityRowsTable({ columns, keys, raw }: Props) {
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const indices = useMemo(() => {
    const q = query.trim().toLowerCase()
    let idx = keys.map((_, i) => i)

    if (q) {
      idx = idx.filter((i) => {
        if (keys[i].toLowerCase().includes(q)) return true
        return columns.some((c) => (c.values[i] ?? '').toLowerCase().includes(q))
      })
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
  }, [query, sortCol, sortDir, columns, keys])

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
              {columns.map((c) => (
                <th
                  key={c.path}
                  onClick={() => toggleSort(c.path)}
                  className="cursor-pointer whitespace-nowrap bg-muted px-3 py-2 text-left font-mono text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="inline-flex items-center gap-1">
                    {c.path}
                    {sortCol === c.path &&
                      (sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </span>
                </th>
              ))}
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
                  No rows match “{query}”.
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
