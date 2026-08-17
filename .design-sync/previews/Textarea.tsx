import { Textarea, Label } from 'association-gm-ui'

export function LabeledField() {
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="trade-notes">Trade notes</Label>
      <Textarea
        id="trade-notes"
        placeholder="Add context for this proposal…"
        defaultValue="Sends out an expiring contract and a lightly-protected 2029 first for cap flexibility ahead of the deadline."
      />
    </div>
  )
}
