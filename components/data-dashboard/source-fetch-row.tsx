'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SourceLink } from '@/components/data-dashboard/source-link'

interface RescueResult {
  ok: boolean
  message: string
  output?: string
}

/** One row in the "Source fetches" list: the source, its last-run status,
 *  and — when it failed — a Rescue button that re-fetches just that source
 *  from this machine and regenerates the data files (see /api/data-rescue).
 *  A client component (not just the button) so the result panel can be a
 *  sibling of the whole row in the flex-wrap layout and span the full card
 *  width when it wraps, instead of being squeezed into the button's own
 *  narrow flex box. */
export function SourceFetchRow({
  id,
  runPyKey,
  ok,
  rescued,
}: {
  id: string
  runPyKey: string
  ok: boolean | null
  rescued: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RescueResult | null>(null)

  async function rescue() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/data-rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runPyKey }),
      })
      const body: RescueResult = await res.json()
      setResult(body)
      if (body.ok) startTransition(() => router.refresh())
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Rescue failed' })
    } finally {
      setRunning(false)
    }
  }

  const busy = running || pending

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs">
      <SourceLink sourceId={id} fullLabel />
      <div className="flex shrink-0 items-center gap-2">
        {ok === null ? (
          <span className="text-muted-foreground">no data</span>
        ) : ok ? (
          <span className="font-semibold text-success">{rescued ? 'rescued' : 'scraped'}</span>
        ) : (
          <>
            <span className="font-semibold text-destructive">failed</span>
            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={rescue} disabled={busy}>
              <LifeBuoy className={`size-3 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Rescuing…' : 'Rescue'}
            </Button>
          </>
        )}
      </div>

      {result && (
        <div
          className={`flex basis-full items-start gap-2 rounded-lg border p-2.5 text-xs ${
            result.ok
              ? 'border-success/40 bg-success/5 text-success'
              : 'border-destructive/40 bg-destructive/5 text-destructive'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p>{result.message}</p>
            {result.output && !result.ok && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">Run output</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-snug text-muted-foreground">
                  {result.output.slice(-2000)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
