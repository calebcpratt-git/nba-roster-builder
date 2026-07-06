import { DraftPick } from '@/lib/draft-picks'

export function DraftPickHoverContent({ dp }: { dp: DraftPick }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-popover-foreground">
        {dp.year} · {dp.round}
      </p>
      {dp.pickNumber != null && (
        <p className="text-[11px] text-muted-foreground">Pick #{dp.pickNumber}</p>
      )}
      {dp.teamFrom && (
        <p className="text-[11px] text-muted-foreground">
          From {dp.teamFrom} → {dp.teamOwner}
        </p>
      )}
      {dp.protections && (
        <p className="text-[11px] text-muted-foreground">
          <span className="text-popover-foreground/70">Protections: </span>
          {dp.protections}
        </p>
      )}
      {dp.swapOption && (
        <p className="text-[11px] text-muted-foreground">Can swap with {dp.swapOption}</p>
      )}
      {dp.swapOwner && (
        <p className="text-[11px] text-muted-foreground">{dp.swapOwner} can swap with this pick</p>
      )}
      {dp.pickPool && (
        <p className="text-[11px] text-muted-foreground">
          <span className="text-popover-foreground/70">Pool: </span>
          {dp.pickPool}
        </p>
      )}
      {dp.rank && (
        <p className="text-[11px] text-muted-foreground">
          <span className="text-popover-foreground/70">Selection: </span>
          {dp.rank}
        </p>
      )}
    </div>
  )
}
