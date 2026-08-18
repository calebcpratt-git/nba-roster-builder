import { Checkbox, Label } from 'association-gm-ui'

export function States() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="c1" defaultChecked />
        <Label htmlFor="c1">Eligible for extension</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c2" />
        <Label htmlFor="c2">Include in trade package</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c3" disabled />
        <Label htmlFor="c3">Locked (disabled)</Label>
      </div>
    </div>
  )
}
