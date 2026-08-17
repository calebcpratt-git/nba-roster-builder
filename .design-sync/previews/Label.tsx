import { Label, Checkbox } from 'association-gm-ui'

export function WithControl() {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="bird-rights" defaultChecked />
      <Label htmlFor="bird-rights">Has Bird rights</Label>
    </div>
  )
}
