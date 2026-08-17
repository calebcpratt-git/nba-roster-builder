import { HoverCard, HoverCardTrigger, HoverCardContent, Button } from 'association-gm-ui'

export function PlayerPreview() {
  return (
    <HoverCard defaultOpen>
      <HoverCardTrigger asChild>
        <Button variant="link">Jaylen Brown</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Jaylen Brown</p>
          <p className="text-sm text-muted-foreground">
            Boston Celtics · SF/SG · $49.2M cap hit in 2026-27, supermax
            through 2029-30.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
