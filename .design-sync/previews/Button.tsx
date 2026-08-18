import { Button } from 'association-gm-ui'
import { Trash2, Plus } from 'lucide-react'

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">Sign Player</Button>
      <Button variant="destructive">Release Player</Button>
      <Button variant="outline">Compare Offers</Button>
      <Button variant="secondary">View Cap Sheet</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="link">See full contract</Button>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Add player">
        <Plus />
      </Button>
    </div>
  )
}

export function WithIcon() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="destructive">
        <Trash2 />
        Release from Roster
      </Button>
      <Button disabled>Processing…</Button>
    </div>
  )
}
