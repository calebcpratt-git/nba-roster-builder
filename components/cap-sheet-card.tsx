'use client'

import { CapSheet, CapStatus } from '@/lib/types'
import { TEAMS, CAP_THRESHOLDS, formatCurrency, getCapStatusColor } from '@/lib/data'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Trash2 } from 'lucide-react'

// Reuses the app's existing cap-status hues (see getCapStatusColor in lib/data.ts)
// so a bar's color means the same thing here as it does everywhere else in the app.
const STATUS_BAR_COLOR: Record<CapStatus, string> = {
  'Below Cap': 'bg-emerald-500',
  'Over Cap': 'bg-yellow-500',
  'Luxury Tax': 'bg-amber-500',
  '1st Apron': 'bg-orange-500',
  '2nd Apron': 'bg-red-500',
}

function secondApronFor(season: CapSheet['summary']['seasons'][number]['season']): number {
  return CAP_THRESHOLDS[season]?.find((t) => t.type === 'second-apron')?.value ?? 1
}

function SeasonBars({ seasons }: { seasons: CapSheet['summary']['seasons'] }) {
  if (seasons.length === 0) return null

  return (
    <div>
      <div className="flex items-end gap-1 h-10">
        {seasons.map(({ season, total, status }) => {
          const pct = Math.max(4, Math.min(100, Math.round((total / secondApronFor(season)) * 100)))
          return (
            <div
              key={season}
              className="flex-1 flex items-end h-full"
              title={`${season}: ${formatCurrency(total)} · ${status}`}
            >
              <div
                className={`w-full rounded-t-sm ${STATUS_BAR_COLOR[status]}`}
                style={{ height: `${pct}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
        <span>{seasons[0].season}</span>
        {seasons.length > 1 && <span>{seasons[seasons.length - 1].season}</span>}
      </div>
    </div>
  )
}

export function CapSheetCard({
  sheet,
  onOpen,
  onDelete,
}: {
  sheet: CapSheet
  onOpen: (sheet: CapSheet) => void
  onDelete: (id: string) => void
}) {
  const team = TEAMS[sheet.teamAbbr]
  const latestSeason = sheet.summary.seasons[sheet.summary.seasons.length - 1]
  const savedDate = new Date(sheet.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(sheet)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(sheet)}
      className="text-left rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
    >
      <div
        className="h-14 px-3 flex items-center justify-between relative"
        style={{
          background: team
            ? `linear-gradient(135deg, ${team.primaryColor}, ${team.secondaryColor})`
            : undefined,
        }}
      >
        <span className="text-white text-xs font-semibold drop-shadow">
          {team ? `${team.city} ${team.name}` : sheet.teamAbbr}
        </span>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-white/80 hover:text-white p-1 -m-1"
              title="Delete cap sheet"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{sheet.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This can't be undone. The saved cap sheet will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(sheet.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <p className="text-sm font-medium truncate">{sheet.name}</p>
          <p className="text-[10px] text-muted-foreground">Saved {savedDate}</p>
        </div>

        <SeasonBars seasons={sheet.summary.seasons} />

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {sheet.summary.rosterCount} players · {sheet.summary.moveCount} moves
          </span>
          {latestSeason && (
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getCapStatusColor(latestSeason.status)}`}
            >
              {latestSeason.status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
