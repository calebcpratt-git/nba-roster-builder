'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RescueResult {
  ok: boolean
  message: string
  output?: string
}

/** Re-fetches one failed source from this machine and regenerates the data
 *  files — for sources blocked on the scheduled run's IP (RealGM's
 *  Cloudflare) but reachable from here. Leaves committing/PRing to the
 *  user, same as RefreshButton does for pulling from origin/main. */
export function RescueButton({ runPyKey }: { runPyKey: string }) {
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
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={rescue} disabled={busy}>
        <LifeBuoy className={`size-3 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Rescuing…' : 'Rescue'}
      </Button>

      {result && (
        <div className={`max-w-sm text-right text-[11px] ${result.ok ? 'text-success' : 'text-destructive'}`}>
          <p>{result.message}</p>
          {result.output && !result.ok && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-left font-mono text-[10px] leading-snug">
              {result.output.slice(-2000)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
