import { Separator } from 'association-gm-ui'

export function Horizontal() {
  return (
    <div className="w-64">
      <div className="text-sm">Boston Celtics</div>
      <Separator className="my-3" />
      <div className="text-sm text-muted-foreground">Eastern Conference</div>
    </div>
  )
}

export function Vertical() {
  return (
    <div className="flex h-8 items-center gap-3 text-sm">
      <span>Roster</span>
      <Separator orientation="vertical" />
      <span>Cap Sheet</span>
      <Separator orientation="vertical" />
      <span>Trades</span>
    </div>
  )
}
