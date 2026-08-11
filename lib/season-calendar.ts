import { Season } from './types'

export interface SeasonCalendar {
  moratoriumStart: string  // ISO
  moratoriumEnd: string
  tradeDeadline: string
  allStar: string
  seasonStart: string
  seasonEnd: string
  /** True if seasonStart is a reported/expected date, not yet the league's official published schedule. */
  seasonStartIsEstimate?: boolean
}

// seasonEnd for 2026-27 isn't set: the league's full schedule release
// (historically mid-August) hadn't dropped as of 2026-08-10. seasonStart uses
// the reported opening-night date (Oct 20, 2026) as a placeholder, flagged via
// seasonStartIsEstimate — needed for the per-day dead-money proration formula
// in roster-context.tsx, which can't run at all without some season-start
// date on file. Replace with the official date once the schedule drops.
export const SEASON_CALENDAR: Partial<Record<Season, SeasonCalendar>> = {
  '2026-27': {
    moratoriumStart: '2026-07-01',
    moratoriumEnd: '2026-07-06',
    tradeDeadline: '2027-02-11',
    allStar: '2027-02-19',
    seasonStart: '2026-10-20',
    seasonStartIsEstimate: true,
    seasonEnd: '',
  },
}

// Which league year a given real-world date falls in, by comparing against
// each season's moratoriumStart (the July 1 league-year rollover). Falls
// back to the earliest known season if run before any moratoriumStart on
// record, and to the latest if run after all of them.
export function getCurrentSeason(today: Date = new Date()): Season | undefined {
  const seasons = (Object.keys(SEASON_CALENDAR) as Season[]).sort()
  if (seasons.length === 0) return undefined
  const started = seasons.filter((s) => new Date(SEASON_CALENDAR[s]!.moratoriumStart) <= today)
  return started.length > 0 ? started[started.length - 1] : seasons[0]
}

// The CBA guarantees every player's full remaining salary for the season by
// January 10, regardless of what the contract itself says — independent of
// any player-specific guaranteeDate on file. January 10 always falls in the
// second calendar year of a season label (e.g. '2026-27' -> Jan 10, 2027).
export function guaranteeLockDate(season: Season): string {
  const startYear = parseInt(season.slice(0, 4), 10)
  return `${startYear + 1}-01-10`
}

// The real-world date range a season's league year spans, for bounding a
// release-date picker. Runs from that season's moratoriumStart up to (but
// not including) the next known season's moratoriumStart, or one year later
// if no later season is on record yet.
export function getSeasonDateBounds(season: Season): { min: string; max: string } | undefined {
  const calendar = SEASON_CALENDAR[season]
  if (!calendar) return undefined
  const min = calendar.moratoriumStart
  const seasons = (Object.keys(SEASON_CALENDAR) as Season[]).sort()
  const nextSeason = seasons.find((s) => s > season)
  const nextStart = nextSeason ? SEASON_CALENDAR[nextSeason]!.moratoriumStart : (() => {
    const d = new Date(min)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().slice(0, 10)
  })()
  const maxDate = new Date(nextStart)
  maxDate.setDate(maxDate.getDate() - 1)
  return { min, max: maxDate.toISOString().slice(0, 10) }
}

export type AcquisitionMethod = 'draft' | 'trade' | 'free-agent' | 'waiver' | 'sign-and-trade' | 'extension'

export interface Acquisition {
  date: string // ISO
  method: AcquisitionMethod
}
