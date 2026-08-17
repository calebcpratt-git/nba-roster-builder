import type { ReactNode } from 'react'
import { familyColor, type SourceFamily } from '@/components/data-dashboard/source-styles'

/** One row in the "Source fetches" list, collapsing every source that
 *  belongs to the same website (Basketball-Reference, RealGM, Hoops Rumors,
 *  SalarySwish, nbacaptracker.com, ...) into a single line: "scraped" if
 *  every source in the group succeeded this run, "failed" if any did.
 *  Expand it to see the same per-source detail the list used to show flat. */
export function SourceFamilyGroup({
  family,
  label,
  ok,
  children,
}: {
  family: SourceFamily
  label: string
  ok: boolean | null
  children: ReactNode
}) {
  const status =
    ok === null ? (
      <span className="text-muted-foreground">no data</span>
    ) : ok ? (
      <span className="font-semibold text-success">scraped</span>
    ) : (
      <span className="font-semibold text-destructive">failed</span>
    )

  return (
    <li className="text-xs">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full" style={{ background: familyColor(family) }} />
            <span className="font-medium">{label}</span>
          </span>
          {status}
        </summary>
        <ul className="mt-1.5 space-y-1.5 border-l-2 pl-2.5">{children}</ul>
      </details>
    </li>
  )
}
