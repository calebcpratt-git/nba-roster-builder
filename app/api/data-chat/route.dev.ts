// Chat backend for the /data dashboard's AI query panel. Dev-only: named
// `route.dev.ts` so the `dev.ts` page-extension gating in next.config.mjs
// keeps it out of the production build entirely, same as the dashboard page
// and the refresh route it sits next to.
//
// No Anthropic SDK dependency — the local toolchain can't currently install
// new packages, so this calls the Messages API directly with fetch and runs
// its own tool-use loop.

import { NextResponse } from 'next/server'
import { TOOLS, runTool } from '@/lib/data-chat-tools'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'
const MAX_TOOL_ROUNDS = 6

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = `You are a data assistant embedded in the Association GM app's local /data dashboard. Answer questions by calling the provided tools to look up real data — players, contracts, team cap state, cap thresholds, league-cap figures, draft picks, free agents. Never guess a number you could look up; call as many tools, across as many entities, as the question needs. Cite which team/season/player the data came from. Keep answers concise and use markdown tables for lists of more than a few rows. If a tool returns an error or empty result, say so plainly rather than inventing data.`

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.' },
      { status: 500 }
    )
  }

  const body = await req.json().catch(() => null)
  const messages = body?.messages as ChatMessage[] | undefined
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversation: any[] = messages.map((m) => ({ role: m.role, content: m.content }))

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: conversation,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Anthropic API error (${res.status}): ${text}` }, { status: 502 })
    }

    const data = await res.json()
    conversation.push({ role: 'assistant', content: data.content })

    if (data.stop_reason !== 'tool_use') {
      const text = (data.content ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b.type === 'text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => b.text)
        .join('\n')
      return NextResponse.json({ reply: text })
    }

    const toolResults = (data.content ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b.type === 'tool_use')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => {
        let output: unknown
        try {
          output = runTool(b.name, b.input ?? {})
        } catch (err) {
          output = { error: err instanceof Error ? err.message : String(err) }
        }
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(output) }
      })

    conversation.push({ role: 'user', content: toolResults })
  }

  return NextResponse.json({ error: 'Gave up after too many tool-call rounds without a final answer.' }, { status: 500 })
}
