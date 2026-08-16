import { SourceLink } from '@/components/data-dashboard/source-link'

/** One row in the "Source fetches" list for a source that fetches many pages
 *  in its own loop (per-team, per-player, per-award-year) rather than one
 *  runPyKey URL — there's no single ok/failed from run.py, so this rolls
 *  every page it fetched this run into one row: "scraped" when every page
 *  came back clean, "failed (n)" — click to see exactly which pages didn't —
 *  when some didn't. No rescue button: unlike a single-URL source, there's
 *  no one runPyKey to re-fetch. */
export function SourceGroupRow({
  id,
  ok,
  total,
  failed,
}: {
  id: string
  ok: boolean | null
  total: number | null
  failed: string[]
}) {
  const label = (
    <span className="inline-flex items-center gap-1.5">
      <SourceLink sourceId={id} fullLabel />
      {total !== null && <span className="font-mono text-[11px] text-muted-foreground">({total})</span>}
    </span>
  )

  if (ok === null) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs">
        {label}
        <span className="text-muted-foreground">no data</span>
      </li>
    )
  }

  if (ok) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs">
        {label}
        <span className="font-semibold text-success">scraped</span>
      </li>
    )
  }

  return (
    <li className="text-xs">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-2 gap-y-1.5 [&::-webkit-details-marker]:hidden">
          {label}
          <span className="font-semibold text-destructive">failed ({failed.length})</span>
        </summary>
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto border-l-2 pl-2 font-mono text-[11px] text-muted-foreground">
          {failed.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </details>
    </li>
  )
}
