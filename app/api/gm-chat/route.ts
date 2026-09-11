// Backend for the GM assistant (components/gm-chat). Unlike the /data
// dashboard's chat this one ships — it is a plain `route.ts`, not `route.dev.ts`.
//
// No Anthropic SDK dependency: the local toolchain can't install new packages,
// so this calls the Messages API directly with fetch and runs its own tool-use
// loop. Responses are streamed back to the client as newline-delimited JSON
// (GmChatEvent) because a multi-round tool loop on Opus takes long enough that
// a silent wait would read as a hang.

import { TOOLS, runTool } from '@/lib/gm-chat/tools'
import { renderContext, renderFocus, systemPrompt } from '@/lib/gm-chat/prompt'
import type { GmChatEvent, GmChatRequest, GmChatSurface } from '@/lib/gm-chat/types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const MAX_TOKENS = 8000
const MAX_TOOL_ROUNDS = 5

const SURFACES: GmChatSurface[] = ['home', 'trade', 'sign-free-agent']

// A block accumulated from the SSE deltas. Thinking blocks are kept (and echoed
// back on the next round) because the API requires them replayed unchanged when
// a tool-use turn continues on the same model.
type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; partialJson: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiBlock = Record<string, any>

function toApiBlock(block: Block): ApiBlock {
  if (block.type === 'tool_use') {
    let input: unknown = {}
    try {
      input = block.partialJson ? JSON.parse(block.partialJson) : {}
    } catch {
      input = {}
    }
    return { type: 'tool_use', id: block.id, name: block.name, input }
  }
  return { ...block }
}

export async function POST(req: Request) {
  const apiKey = process.env.GM_CHAT_ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'The assistant is not configured: GM_CHAT_ANTHROPIC_API_KEY is unset.' },
      { status: 503 }
    )
  }

  const body = (await req.json().catch(() => null)) as GmChatRequest | null
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: 'messages is required' }, { status: 400 })
  }
  if (!body.context?.team?.abbr) {
    return Response.json({ error: 'context is required' }, { status: 400 })
  }
  const surface: GmChatSurface = SURFACES.includes(body.surface) ? body.surface : 'home'

  const conversation: Array<{ role: string; content: unknown }> = body.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content) }))

  // The sheet is re-rendered every turn and appended as a trailing
  // mid-conversation system message rather than folded into the top-level
  // `system` field: that keeps the cached prefix (tools + system prompt + prior
  // turns) byte-stable while the volatile part sits after it, and it reaches
  // the model on the operator channel rather than as user-authored text.
  const sheet = renderContext(body.context)
  conversation.push({
    role: 'system',
    content: body.focus ? `${sheet}\n\n${renderFocus(body.focus)}` : sheet,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: GmChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const { blocks, stopReason } = await streamOneTurn({
            apiKey,
            system: systemPrompt(surface),
            conversation,
            onText: (text) => send({ type: 'text', text }),
          })

          conversation.push({ role: 'assistant', content: blocks.map(toApiBlock) })

          const toolUses = blocks.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
          if (stopReason !== 'tool_use' || toolUses.length === 0) {
            send({ type: 'done' })
            controller.close()
            return
          }

          const results = toolUses.map((block) => {
            send({ type: 'tool', name: block.name })
            const apiBlock = toApiBlock(block)
            let output: unknown
            try {
              output = runTool(block.name, apiBlock.input ?? {})
            } catch (err) {
              output = { error: err instanceof Error ? err.message : String(err) }
            }
            return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) }
          })
          conversation.push({ role: 'user', content: results })
        }

        send({ type: 'error', message: 'Gave up after too many lookups without reaching an answer. Try asking something narrower.' })
        send({ type: 'done' })
        controller.close()
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'The assistant failed to respond.' })
        send({ type: 'done' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
    },
  })
}

/**
 * One streamed Messages API call. Forwards text deltas as they arrive and
 * returns the assembled content blocks plus the stop reason, so the caller can
 * decide whether to run tools and go round again.
 */
async function streamOneTurn({
  apiKey,
  system,
  conversation,
  onText,
}: {
  apiKey: string
  system: string
  conversation: Array<{ role: string; content: unknown }>
  onText: (text: string) => void
}): Promise<{ blocks: Block[]; stopReason: string | null }> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      // Medium rather than the default high: this is an interactive chat, and
      // at high the specialist prompts spend multiple rounds fetching data the
      // context block already contains, which reads as a hang. Medium also
      // consolidates tool calls into fewer rounds.
      output_config: { effort: 'medium' },
      // Breakpoint on the system prompt: tools and system render ahead of the
      // messages, so this caches everything that doesn't change between turns.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages: conversation,
    }),
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Anthropic API error (${res.status})${detail ? `: ${detail.slice(0, 500)}` : ''}`)
  }

  const blocks: Block[] = []
  let stopReason: string | null = null
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line; keep the trailing partial.
    let split: number
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)

      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'))
      if (!dataLine) continue
      let event: ApiBlock
      try {
        event = JSON.parse(dataLine.slice(5).trim())
      } catch {
        continue
      }

      switch (event.type) {
        case 'content_block_start': {
          const cb = event.content_block
          if (cb.type === 'text') blocks[event.index] = { type: 'text', text: '' }
          else if (cb.type === 'thinking') blocks[event.index] = { type: 'thinking', thinking: '', signature: '' }
          else if (cb.type === 'redacted_thinking') blocks[event.index] = { type: 'redacted_thinking', data: cb.data }
          else if (cb.type === 'tool_use')
            blocks[event.index] = { type: 'tool_use', id: cb.id, name: cb.name, partialJson: '' }
          break
        }
        case 'content_block_delta': {
          const block = blocks[event.index]
          const delta = event.delta
          if (!block) break
          if (delta.type === 'text_delta' && block.type === 'text') {
            block.text += delta.text
            onText(delta.text)
          } else if (delta.type === 'thinking_delta' && block.type === 'thinking') {
            block.thinking += delta.thinking
          } else if (delta.type === 'signature_delta' && block.type === 'thinking') {
            block.signature += delta.signature
          } else if (delta.type === 'input_json_delta' && block.type === 'tool_use') {
            block.partialJson += delta.partial_json
          }
          break
        }
        case 'message_delta':
          stopReason = event.delta?.stop_reason ?? stopReason
          break
        case 'error':
          throw new Error(event.error?.message ?? 'The assistant stream failed.')
      }
    }
  }

  return { blocks: blocks.filter(Boolean), stopReason }
}
