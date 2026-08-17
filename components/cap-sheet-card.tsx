'use client'

import { useMemo, useState } from 'react'
import { CapSheet, CapStatus, Season, SEASONS } from '@/lib/types'
import { TEAMS, TEAM_NAMES, CAP_THRESHOLDS, formatCurrency, getTeamRoster } from '@/lib/data'
import { getDraftPickPlayers, applyPickNumberOverrides } from '@/lib/draft-picks'
import { normalizeTrade, partnersOf, incomingFor, outgoingFor } from '@/lib/trade-model'
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
import { Trash2, ChevronRight, ChevronDown, FileText, ArrowLeftRight, UserPlus, UserMinus, Ban } from 'lucide-react'

// Reuses the app's existing cap-status hues (see getCapStatusColor in lib/data.ts)
// so a bar's color means the same thing here as it does everywhere else in the app.
const STATUS_BAR_COLOR: Record<CapStatus, string> = {
  'Below Cap': 'bg-emerald-500',
  'Over Cap': 'bg-yellow-500',
  'Luxury Tax': 'bg-amber-500',
  '1st Apron': 'bg-orange-500',
  '2nd Apron': 'bg-red-500',
}

// Anchor for flagging moves that don't take effect this season — a signing
// or decline dated to a later year in the scenario (e.g. a free agent
// signed starting 2027-28) needs to read as "future," not as happening now.
const CURRENT_SEASON: Season = SEASONS[0]

const SEASON_BARS_COUNT = 4

// Matches the h-32 chart height below (8rem @ 16px/rem). Needed in px, not
// just as a class, to run label collision avoidance in the same units.
const CHART_HEIGHT_PX = 128
// Luxury tax / 1st apron / 2nd apron sit close together as a fraction of the
// 2nd apron (often within a few px of each other at this chart height), so
// their labels get pushed apart to stay legible instead of stacking exactly
// on their lines.
const MIN_LABEL_GAP_PX = 9

function secondApronFor(season: CapSheet['summary']['seasons'][number]['season']): number {
  return CAP_THRESHOLDS[season]?.find((t) => t.type === 'second-apron')?.value ?? 1
}

// Same threshold types the status ladder in getCapStatus uses, in ascending
// order, colored to match the status they mark the start of (see
// STATUS_BAR_COLOR above).
const THRESHOLD_LINES: { type: 'soft-cap' | 'luxury-tax' | 'first-apron' | 'second-apron'; color: string; textColor: string; label: string }[] = [
  { type: 'soft-cap', color: 'border-yellow-500/60', textColor: 'text-yellow-600 dark:text-yellow-500', label: 'Cap' },
  { type: 'luxury-tax', color: 'border-amber-500/60', textColor: 'text-amber-600 dark:text-amber-500', label: 'Tax' },
  { type: 'first-apron', color: 'border-orange-500/60', textColor: 'text-orange-600 dark:text-orange-500', label: '1st Apron' },
  { type: 'second-apron', color: 'border-red-500/60', textColor: 'text-red-600 dark:text-red-500', label: '2nd Apron' },
]

function SeasonBars({ seasons }: { seasons: CapSheet['summary']['seasons'] }) {
  if (seasons.length === 0) return null

  const displayedSeasons = seasons.slice(0, SEASON_BARS_COUNT)

  // Every year's four thresholds sit at (near enough) the same fraction of
  // that year's second apron — the whole ladder scales with cap inflation
  // together. So the lines only need computing once, off a single reference
  // season, and they land in the same spot for every bar even though the
  // underlying dollar figures differ year to year.
  const referenceSeason = displayedSeasons[0].season
  const referenceSecondApron = secondApronFor(referenceSeason)
  const thresholdLines = THRESHOLD_LINES.map(({ type, color, textColor, label }) => {
    const value = CAP_THRESHOLDS[referenceSeason]?.find((t) => t.type === type)?.value
    if (!value) return null
    const pct = Math.min(100, (value / referenceSecondApron) * 100)
    return { type, color, textColor, label, pct, top: CHART_HEIGHT_PX * (1 - pct / 100) }
  }).filter((line) => line !== null)

  // Push labels apart top-to-bottom so tightly clustered thresholds (e.g.
  // tax/1st apron/2nd apron near the top of the chart) don't render on top
  // of each other; the dashed lines themselves stay at their exact pct.
  const labelPositions = [...thresholdLines]
    .sort((a, b) => a.top - b.top)
    .reduce<typeof thresholdLines>((acc, line) => {
      const prev = acc[acc.length - 1]
      const top = prev ? Math.max(line.top, prev.top + MIN_LABEL_GAP_PX) : line.top
      acc.push({ ...line, top })
      return acc
    }, [])

  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        <div className="relative flex-1 flex items-end gap-1 h-full">
          {thresholdLines.map((line) => (
            <div
              key={line.type}
              className={`absolute left-0 right-0 border-t border-dashed ${line.color}`}
              style={{ bottom: `${line.pct}%` }}
            />
          ))}
          {displayedSeasons.map(({ season, total, status }) => {
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
        <div className="relative w-11 h-full shrink-0">
          {labelPositions.map((line) => (
            <span
              key={line.type}
              className={`absolute right-0 -translate-y-1/2 text-[8px] leading-none whitespace-nowrap ${line.textColor}`}
              style={{ top: `${line.top}px` }}
            >
              {line.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1 pr-11">
        <span>{displayedSeasons[0].season}</span>
        {displayedSeasons.length > 1 && <span>{displayedSeasons[displayedSeasons.length - 1].season}</span>}
      </div>
    </div>
  )
}

// A declined-option key is always `declined-{entityId}-{season}`, where
// entityId itself may contain hyphens (roster ids are `player-{idx}`, draft
// pick ids are `draft-{year}-{round}-{team}-{idx}`). The season is always the
// last `YYYY-YY`-shaped segment, so anchor on that instead of splitting on '-'.
function parseDeclinedKey(key: string): { entityId: string; season: Season } | null {
  const match = key.match(/^declined-(.+)-(\d{4}-\d{2})$/)
  if (!match) return null
  return { entityId: match[1], season: match[2] as Season }
}

function resolveEntityName(teamAbbr: string, pickNumberOverrides: Record<string, number>, entityId: string): string {
  const rosterMatch = getTeamRoster(teamAbbr).find((p) => p.id === entityId)
  if (rosterMatch) return rosterMatch.name

  const pickMatch = applyPickNumberOverrides(getDraftPickPlayers(teamAbbr), pickNumberOverrides).find(
    (p) => p.id === entityId
  )
  if (pickMatch) return pickMatch.name

  return 'Unknown player'
}

type MoveKind = 'extension' | 'free-agent' | 'trade' | 'option' | 'release'

interface MoveItem {
  key: string
  kind: MoveKind
  title: string
  detail?: string
  season?: Season
}

const MOVE_ICON_STYLE: Record<MoveKind, { Icon: typeof FileText; bg: string; fg: string }> = {
  extension: { Icon: FileText, bg: 'bg-primary/20', fg: 'text-primary' },
  'free-agent': { Icon: UserPlus, bg: 'bg-chart-2/20', fg: 'text-chart-2' },
  trade: { Icon: ArrowLeftRight, bg: 'bg-chart-4/20', fg: 'text-chart-4' },
  option: { Icon: Ban, bg: 'bg-muted', fg: 'text-muted-foreground' },
  release: { Icon: UserMinus, bg: 'bg-red-500/15', fg: 'text-red-600' },
}

// Derived live from the snapshot rather than trusting the persisted
// summary.moveCount — that field is only as fresh as the last save, so a
// sheet saved before a new move type (e.g. releases) counted would show a
// number out of sync with what the snapshot (and the dropdown built from it)
// actually contains.
function countMoves(snapshot: CapSheet['snapshot']): number {
  return (
    snapshot.savedContracts.length +
    snapshot.savedTrades.length +
    snapshot.exercisedTeamOptionKeys.length +
    snapshot.exercisedPlayerOptionKeys.length +
    snapshot.releasedRosterIds.length
  )
}

function buildMoves(sheet: CapSheet): MoveItem[] {
  const { snapshot } = sheet
  const moves: MoveItem[] = []

  snapshot.savedContracts.forEach((contract) => {
    const contractSeasons = (Object.keys(contract.salary) as Season[]).sort(
      (a, b) => SEASONS.indexOf(a) - SEASONS.indexOf(b)
    )
    const years = contractSeasons.length
    const total = Object.values(contract.salary).reduce((a, b) => a + b, 0)
    const waived = snapshot.deletedContractIds.includes(contract.id)
    const typeLabel =
      contract.type === 'extension'
        ? 'Extension'
        : contract.type === 'trade'
        ? 'Trade contract'
        : 'Free agent signing'

    moves.push({
      key: `contract-${contract.id}`,
      kind: contract.type,
      title: contract.playerName,
      detail: `${typeLabel} · ${years}yr / ${formatCurrency(total)}${waived ? ' · waived' : ''}`,
      season: contractSeasons[0],
    })
  })

  snapshot.savedTrades.forEach((saved) => {
    const trade = normalizeTrade(saved, sheet.teamAbbr)
    const partners = partnersOf(trade, sheet.teamAbbr)
    const label =
      partners.length <= 1
        ? TEAM_NAMES[partners[0]] || partners[0] || 'no partner'
        : `${trade.teams.length} teams (${partners.join(', ')})`

    const outCount = outgoingFor(trade, sheet.teamAbbr).length
    const incoming = incomingFor(trade, sheet.teamAbbr)
    const inNames = incoming.filter((m) => m.kind === 'player').map((m) => m.name ?? m.id)
    const inPickCount = incoming.filter((m) => m.kind === 'pick').length

    const outDesc = outCount > 0 ? `${outCount} asset${outCount !== 1 ? 's' : ''} sent` : null
    const inParts = [...inNames, inPickCount > 0 ? `${inPickCount} pick${inPickCount !== 1 ? 's' : ''}` : null].filter(
      Boolean
    )
    const inDesc = inParts.length > 0 ? `acquired ${inParts.join(', ')}` : null

    moves.push({
      key: `trade-${trade.id}`,
      kind: 'trade',
      title: trade.isSignAndTrade ? `Sign-and-trade with ${label}` : `Trade with ${label}`,
      detail: [outDesc, inDesc].filter(Boolean).join(' · ') || 'No assets recorded',
    })
  })

  const optionMoves = (keys: string[], optionType: 'Team' | 'Player') =>
    keys.forEach((key) => {
      const parsed = parseDeclinedKey(key)
      if (!parsed) return
      const name = resolveEntityName(sheet.teamAbbr, snapshot.pickNumberOverrides, parsed.entityId)
      moves.push({
        key: `option-${key}`,
        kind: 'option',
        title: `${name} — declined ${optionType.toLowerCase()} option`,
        season: parsed.season,
      })
    })

  optionMoves(snapshot.exercisedTeamOptionKeys, 'Team')
  optionMoves(snapshot.exercisedPlayerOptionKeys, 'Player')

  snapshot.releasedRosterIds.forEach((playerId) => {
    const name = resolveEntityName(sheet.teamAbbr, snapshot.pickNumberOverrides, playerId)
    moves.push({
      key: `release-${playerId}`,
      kind: 'release',
      title: `${name} — released`,
    })
  })

  return moves
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
  const [expanded, setExpanded] = useState(false)
  const team = TEAMS[sheet.teamAbbr]
  const savedDate = new Date(sheet.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const moveCount = countMoves(sheet.snapshot)
  const moves = useMemo(() => (expanded ? buildMoves(sheet) : null), [expanded, sheet])

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

        <div
          className="flex items-center gap-1 -m-1 p-1 rounded hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-[10px] text-muted-foreground">
            {moveCount} move{moveCount !== 1 ? 's' : ''}
          </span>
        </div>

        {expanded && (
          <div
            className="space-y-1.5 pt-2 border-t border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {moves && moves.length > 0 ? (
              moves.map((move) => {
                const { Icon, bg, fg } = MOVE_ICON_STYLE[move.kind]
                const isFuture = !!move.season && SEASONS.indexOf(move.season) > SEASONS.indexOf(CURRENT_SEASON)
                return (
                  <div key={move.key} className="flex items-start gap-2">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${bg}`}>
                      <Icon className={`h-3 w-3 ${fg}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium truncate">{move.title}</p>
                      {move.detail && <p className="text-[10px] text-muted-foreground">{move.detail}</p>}
                    </div>
                    {isFuture && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 shrink-0">
                        Future · {move.season}
                      </span>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-[10px] text-muted-foreground">No moves saved in this scenario.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
