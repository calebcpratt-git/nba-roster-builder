'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RefreshResult {
  ok: boolean
  message: string
  changed?: string[]
  blockedBy?: string[]
}

/** Pulls the generated data files from origin/main — this morning's scrape. */
export function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RefreshResult | null>(null)

  async function refresh() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/data-refresh', { method: 'POST' })
      const body: RefreshResult = await res.json()
      setResult(body)
      if (body.ok) startTransition(() => router.refresh())
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Refresh failed' })
    } finally {
      setRunning(false)
    }
  }

  const busy = running || pending

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
        <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Pulling…' : 'Pull latest scrape'}
      </Button>

      {result && (
        <div className={`max-w-md text-right text-xs ${result.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
          <p>{result.message}</p>
          {result.changed && result.changed.length > 0 && (
            <p className="font-mono text-[11px]">{result.changed.join(', ')}</p>
          )}
          {result.blockedBy && result.blockedBy.length > 0 && (
            <p className="font-mono text-[11px]">{result.blockedBy.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  )
}
