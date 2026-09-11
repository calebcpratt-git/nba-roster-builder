'use client'

// The GM assistant: a floating launcher plus a slide-in chat panel, wired to
// the streaming /api/gm-chat route. It sends the user's live cap sheet
// (useGmChatContext) on every turn, so the assistant answers about the roster
// as the user has edited it rather than the untouched scraped data.
//
// `surface` selects the prompt addendum — the same component is meant to be
// dropped into the trade builder and the free-agent flow later, which is why
// nothing here is homepage-specific.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useRoster } from '@/lib/roster-context'
import { useGmChatContext } from '@/lib/gm-chat/context'
import type { GmChatEvent, GmChatFocus, GmChatMessage, GmChatSurface } from '@/lib/gm-chat/types'
import { cn } from '@/lib/utils'
import { ChatMarkdown } from './chat-markdown'

const TOOL_LABELS: Record<string, string> = {
  list_teams: 'Looking up teams',
  search_players: 'Searching players',
  get_team_roster: 'Reading a roster',
  get_contract_detail: 'Reading contract detail',
  get_team_cap_state: 'Checking cap state',
  get_cap_thresholds: 'Checking cap thresholds',
  get_league_cap: 'Reading league cap figures',
  get_draft_picks: 'Checking draft picks',
  get_free_agents: 'Scanning free agents',
}

/** Copy that distinguishes each specialist from the general assistant. */
const SURFACE_CHROME: Record<GmChatSurface, { label: string; title: string; blurb: string; placeholder: string }> = {
  home: {
    label: 'Ask GM',
    title: 'Assistant GM',
    blurb: 'Ask about the cap sheet — including the moves you have already made on it.',
    placeholder: 'Ask about the cap sheet, a trade, a signing…',
  },
  trade: {
    label: 'Trade help',
    title: 'Trade Desk',
    blurb: 'Salary matching, apron restrictions, and what would make the deal on the board work.',
    placeholder: 'Does this deal work? What filler do we need?',
  },
  'sign-free-agent': {
    label: 'Signing help',
    title: 'Signing Desk',
    blurb: 'Which exception funds a signing, the most you can offer, and what it hard-caps you into.',
    placeholder: 'What can we offer? Which exception funds it?',
  },
}

export function GmChat({
  surface = 'home',
  focus,
  variant = 'floating',
}: {
  surface?: GmChatSurface
  focus?: GmChatFocus
  /**
   * 'floating' is the homepage's fixed launcher. 'inline' sits in a desktop
   * panel's team-colored header bar; 'inline-muted' in the mobile card's plain
   * one, which has no tint to sit white text on.
   */
  variant?: 'floating' | 'inline' | 'inline-muted'
}) {
  const { selectedTeam } = useRoster()
  const context = useGmChatContext()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<GmChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [activity, setActivity] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // The in-flight answer is mirrored in a ref so the stream reader can append
  // to it without re-subscribing to state on every chunk.
  const draftRef = useRef('')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming, activity])

  // Abandon an in-flight answer when the panel closes or the page unmounts.
  useEffect(() => {
    if (!open) abortRef.current?.abort()
  }, [open])
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string) => {
      const question = text.trim()
      if (!question || loading) return

      const next: GmChatMessage[] = [...messages, { role: 'user', content: question }]
      setMessages(next)
      setInput('')
      setError(null)
      setLoading(true)
      setActivity(null)
      setStreaming('')
      draftRef.current = ''

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/gm-chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: next, surface, context, focus }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null)
          setError(detail?.error ?? `The assistant could not be reached (${res.status}).`)
          setStreaming(null)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let newline: number
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            if (!line) continue

            let event: GmChatEvent
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }

            if (event.type === 'text') {
              setActivity(null)
              draftRef.current += event.text
              setStreaming(draftRef.current)
            } else if (event.type === 'tool') {
              setActivity(TOOL_LABELS[event.name] ?? 'Looking something up')
            } else if (event.type === 'error') {
              setError(event.message)
            }
          }
        }

        if (draftRef.current) {
          setMessages([...next, { role: 'assistant', content: draftRef.current }])
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'The assistant failed to respond.')
        }
      } finally {
        setStreaming(null)
        setActivity(null)
        setLoading(false)
        abortRef.current = null
      }
    },
    [context, focus, loading, messages, surface]
  )

  const chrome = SURFACE_CHROME[surface] ?? SURFACE_CHROME.home
  const suggestions = buildSuggestions(surface, context.seasons[0]?.apronStatus, context.team.name)
  const inline = variant !== 'floating'

  // The transcript, composer, and error rail — identical whether this is the
  // homepage's full-height sheet or a panel-sized overlay.
  const body = (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px]">
        {messages.length === 0 && !streaming && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try asking:</p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-left hover:bg-muted"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-white"
              style={{ background: selectedTeam.primaryColor }}
            >
              {m.content}
            </div>
          ) : (
            <div key={i} className="mr-auto max-w-[95%] rounded-lg bg-muted px-3 py-2 text-foreground">
              <ChatMarkdown content={m.content} />
            </div>
          )
        )}

        {streaming && (
          <div className="mr-auto max-w-[95%] rounded-lg bg-muted px-3 py-2 text-foreground">
            <ChatMarkdown content={streaming} />
          </div>
        )}

        {loading && !streaming && (
          <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {activity ?? 'Reading the cap sheet'}…
          </div>
        )}

        {activity && streaming && (
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {activity}…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
            <X className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex shrink-0 items-end gap-2 border-t border-border p-3"
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
          placeholder={chrome.placeholder}
          className="min-h-10 resize-none text-[13px]"
          rows={1}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </>
  )

  if (inline) {
    return (
      <>
        <button
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-label={chrome.title}
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-[3px] text-[10px] font-semibold transition-colors',
            variant === 'inline'
              ? // In a desktop panel's colored header bar, so it borrows the
                // white-on-tint treatment the expand toggle beside it uses.
                'bg-white/15 text-white/90 hover:bg-white/25 hover:text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            open && (variant === 'inline' ? 'bg-white/30 text-white' : 'bg-muted/70 text-foreground')
          )}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.25} />
          {chrome.label}
        </button>

        {/* Fills the panel it was launched from rather than taking over the
            right edge of the screen — the panel shells are `relative` so this
            resolves to the panel's own box, and their overflow-hidden keeps
            the rounded corners. */}
        {open && (
          <div className="absolute inset-0 z-30 flex flex-col bg-card text-left">
            <div
              className="flex shrink-0 items-center justify-between gap-2 px-3.5 py-2.5 text-white"
              style={{ background: selectedTeam.primaryColor }}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <Bot className="h-3.5 w-3.5 shrink-0" />
                  {chrome.title}
                </p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-white/75">{chrome.blurb}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label={`Close ${chrome.title}`}
                className="shrink-0 text-white/80 transition-colors hover:text-white"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </div>
            {body}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask the assistant GM"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-[13px] font-semibold text-white shadow-lg transition-transform hover:scale-105"
        style={{ background: selectedTeam.primaryColor }}
      >
        <Sparkles className="size-4" />
        {chrome.label}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        {/* The sheet's built-in close button sits over the team-colored header,
            so it is tinted to match rather than staying foreground-dark. */}
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg [&>button]:text-white [&>button]:opacity-80 [&>button:hover]:opacity-100"
        >
          <SheetHeader
            className="shrink-0 space-y-1 px-4 py-3 text-white"
            style={{ background: selectedTeam.primaryColor }}
          >
            <SheetTitle className="flex items-center gap-2 text-white">
              <Bot className="size-4" />
              {chrome.title}
            </SheetTitle>
            <SheetDescription className="text-white/80">{chrome.blurb}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    </>
  )
}

function buildSuggestions(surface: GmChatSurface, apronStatus: string | undefined, teamName: string): string[] {
  const overTheLine = apronStatus === 'Luxury Tax' || apronStatus === '1st Apron' || apronStatus === '2nd Apron'

  if (surface === 'trade') {
    return [
      'Does the deal on the board work? Walk me through the salary matching.',
      'What is the most salary we can take back right now?',
      overTheLine
        ? 'Which apron rules are restricting what we can trade for?'
        : 'Which of our contracts are the best trade filler?',
      'Are any of our picks untradeable?',
    ]
  }

  if (surface === 'sign-free-agent') {
    return [
      'What is the most we can offer a free agent right now, and what funds it?',
      'Would using the MLE hard-cap us? What would that cost?',
      'Which cap holds should we renounce to create room?',
      `Who in this pool is realistic for the ${teamName}?`,
    ]
  }

  return [
    overTheLine
      ? `What are the cheapest ways to get under the ${apronStatus === 'Luxury Tax' ? 'tax line' : apronStatus}?`
      : 'How much cap space can we actually create this summer?',
    'Which of our contracts are the best trade filler?',
    'What should we do with our option decisions?',
    `Who in free agency is realistic for the ${teamName}?`,
  ]
}
