import { Toggle } from 'association-gm-ui'
import { Star } from 'lucide-react'

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toggle aria-label="Watchlist">
        <Star />
        Watchlist
      </Toggle>
      <Toggle variant="outline" defaultPressed>
        <Star />
        Pinned
      </Toggle>
      <Toggle size="sm">Small</Toggle>
      <Toggle size="lg">Large</Toggle>
    </div>
  )
}
