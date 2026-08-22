import Link from 'next/link'
import type { OverridePipelineStage } from '@/lib/data-schema'
import { SourceLink } from './source-link'

const KIND_STYLE: Record<
  OverridePipelineStage['kind'],
  { badge: string; dot: string; verb: string }
> = {
  seed: { badge: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground', verb: 'seeds' },
  correct: {
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-500',
    dot: 'bg-amber-500',
    verb: 'corrects',
  },
  reconcile: {
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
    verb: 'reconciles',
  },
  merge: { badge: 'border-success/30 bg-success/10 text-success', dot: 'bg-success', verb: 'merges' },
  derive: { badge: 'border-primary/30 bg-primary/10 text-primary', dot: 'bg-primary', verb: 'derives' },
}

/**
 * The daily scrape's build order as a vertical timeline: one stage per step
 * in scripts/scrape/run.py, numbered in the order it actually runs, each
 * annotated with what it does to the entity/fields an earlier stage already
 * wrote — a seed step and the correct/reconcile/merge steps that follow it
 * only make sense read as a sequence, which is what per-field source lists
 * (a flat, unordered set) can't express on their own.
 */
export function OverridePipeline({
  stages,
  entityLabels,
}: {
  stages: OverridePipelineStage[]
  entityLabels: Record<string, string>
}) {
  return (
    <ol className="max-w-3xl">
      {stages.map((stage, i) => {
        const style = KIND_STYLE[stage.kind]
        const isLast = i === stages.length - 1
        return (
          <li key={stage.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" aria-hidden />}
            <span
              className={`mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums ${style.badge}`}
            >
              {i + 1}
            </span>

            <div className="flex-1 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold leading-tight">{stage.label}</h4>
                  <span
                    className={`rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${style.badge}`}
                  >
                    {style.verb}
                  </span>
                </div>
                <Link
                  href={`/data/${stage.entity}`}
                  className="font-mono text-[11px] text-muted-foreground hover:text-primary hover:underline"
                >
                  {entityLabels[stage.entity] ?? stage.entity}
                </Link>
              </div>

              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{stage.fields.join(', ')}</p>

              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{stage.summary}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2">
                {stage.sources.length === 0 ? (
                  <span className="text-[11px] italic text-muted-foreground">
                    no fetch — computed from the stage above
                  </span>
                ) : (
                  stage.sources.map((id, si) => (
                    <span key={id} className="inline-flex items-center gap-2">
                      {si > 0 && <span className="text-muted-foreground">·</span>}
                      <SourceLink sourceId={id} />
                    </span>
                  ))
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
