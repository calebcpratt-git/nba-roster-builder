import { Switch, Label } from 'association-gm-ui'

export function States() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Switch id="hard-cap" defaultChecked />
        <Label htmlFor="hard-cap">Hard-capped at first apron</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="two-way" />
        <Label htmlFor="two-way">Two-way eligible</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="locked" disabled />
        <Label htmlFor="locked">Locked (disabled)</Label>
      </div>
    </div>
  )
}
