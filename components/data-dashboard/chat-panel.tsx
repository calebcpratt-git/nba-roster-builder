'use client'

// Slide-in AI query panel for the /data dashboard. Lets you ask free-form
// questions across every data entity (players, contracts, cap state, cap
// thresholds, draft picks, free agents) — the backend (app/api/data-chat,
// dev-only) runs a tool-use loop against lib/data-chat-tools.ts so answers
// come from the real generated data, not the model's memory.

import { useEffect, useRef, useState } from 'react'
import { MessageCircleQuestion, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Which Celtics players have a player option next season?',
  "What's Golden State's cap state for 2026-27?",
  'List restricted free agents from the Lakers.',
  'What are the 2027-28 apron thresholds?',
]

export function DataChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const question = text.trim()
    if (!question || loading) return

    const next: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/data-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? `Request failed (${res.status})`)
        return
      }
      setMessages([...next, { role: 'assistant', content: data.reply ?? '(no reply)' }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <MessageCircleQuestion className="size-4" />
          Ask the data
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ask the data</SheetTitle>
          <SheetDescription>
            Query players, contracts, cap state, cap thresholds, draft picks, and free agents in plain English.
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Try asking:</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                m.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto bg-muted text-foreground'
              )}
            >
              {m.content}
            </div>
          ))}

          {loading && (
            <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Querying…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask about any player, team, contract, or cap figure…"
            className="min-h-10 resize-none"
            rows={1}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
