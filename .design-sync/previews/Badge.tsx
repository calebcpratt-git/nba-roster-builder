import { Badge } from 'association-gm-ui'

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Under Contract</Badge>
      <Badge variant="secondary">Free Agent</Badge>
      <Badge variant="destructive">Over Apron</Badge>
      <Badge variant="outline">Two-Way</Badge>
    </div>
  )
}
