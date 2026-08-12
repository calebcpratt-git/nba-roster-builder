// Source colors carried over from the published Contract & Acquisition Schema
// artifact's legend, so a source reads the same in both places. Scoped to this
// class rather than added to globals.css — the dashboard is dev-only and
// nothing here should reach the app's production stylesheet.
export const SOURCE_STYLES = `
.ds-scope { --ds-bbref:#2c5f8a; --ds-realgm:#7a4fa0; --ds-hoops:#b5651d; --ds-captracker:#3f7d4f; --ds-swish:#c0397a; --ds-hand:#6b6a63; --ds-none:#b3352c; }
.dark .ds-scope { --ds-bbref:#6ea3d6; --ds-realgm:#b892d9; --ds-hoops:#e0a05f; --ds-captracker:#7ec98f; --ds-swish:#e688b6; --ds-hand:#a09985; --ds-none:#e07b72; }
`

export type SourceFamily = 'bbref' | 'realgm' | 'hoops' | 'captracker' | 'swish' | 'hand' | 'none'

export const FAMILY_LABELS: Record<SourceFamily, string> = {
  bbref: 'Basketball-Reference',
  realgm: 'RealGM',
  hoops: 'Hoops Rumors',
  captracker: 'nbacaptracker.com',
  swish: 'SalarySwish.com',
  hand: 'Hand-maintained',
  none: 'No source',
}

export function sourceFamily(sourceId: string): SourceFamily {
  if (sourceId.startsWith('bbref')) return 'bbref'
  if (sourceId.startsWith('realgm')) return 'realgm'
  if (sourceId.startsWith('hr-')) return 'hoops'
  if (sourceId.startsWith('captracker')) return 'captracker'
  if (sourceId.startsWith('salaryswish')) return 'swish'
  if (sourceId === 'cap-memo') return 'hand'
  return 'none'
}

export function familyColor(family: SourceFamily): string {
  return `var(--ds-${family})`
}

/** Horizontal fill showing what share of an entity's fields carry data. */
export function CoverageBar({ populated, total }: { populated: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((100 * populated) / total)
  const tone = pct === 100 ? 'var(--ds-captracker)' : pct >= 60 ? 'var(--ds-hoops)' : 'var(--ds-none)'

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {populated}/{total}
      </span>
    </div>
  )
}
