import { Input, Label } from 'association-gm-ui'

export function LabeledField() {
  return (
    <div className="flex w-64 flex-col gap-1.5">
      <Label htmlFor="player-search">Search players</Label>
      <Input id="player-search" placeholder="Jaylen Brown" />
    </div>
  )
}

export function States() {
  return (
    <div className="flex w-64 flex-col gap-3">
      <Input defaultValue="Filled value" />
      <Input placeholder="Disabled" disabled />
      <Input type="number" placeholder="0" aria-invalid />
    </div>
  )
}
