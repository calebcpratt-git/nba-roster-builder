'use client'

// The assistant answers in a deliberately small subset of markdown — bold,
// bullets, and paragraphs, per the formatting rules in lib/gm-chat/prompt.ts —
// so this renders exactly that subset rather than pulling in a markdown
// dependency the local toolchain can't install.

import { Fragment, type ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  // Split on **bold** and `code`, keeping the delimiters' contents.
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function ChatMarkdown({ content }: { content: string }) {
  const nodes: ReactNode[] = []
  let bullets: string[] = []

  const flushBullets = () => {
    if (bullets.length === 0) return
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="list-disc space-y-1 pl-4">
        {bullets.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    )
    bullets = []
  }

  content.split('\n').forEach((rawLine) => {
    const line = rawLine.trimEnd()
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    if (bullet) {
      bullets.push(bullet[1])
      return
    }
    flushBullets()
    if (!line.trim()) return
    // Headings collapse to a bold line — the panel is too narrow for a scale.
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      nodes.push(
        <p key={`h-${nodes.length}`} className="font-semibold">
          {renderInline(heading[1])}
        </p>
      )
      return
    }
    nodes.push(<p key={`p-${nodes.length}`}>{renderInline(line)}</p>)
  })
  flushBullets()

  return <div className="space-y-2 leading-relaxed">{nodes}</div>
}
