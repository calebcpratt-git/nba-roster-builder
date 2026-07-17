import { Season } from './types'

export interface SeasonCalendar {
  moratoriumStart: string  // ISO
  moratoriumEnd: string
  tradeDeadline: string
  allStar: string
  seasonStart: string
  seasonEnd: string
}

// Empty by design. Only the current season's dates are realistically knowable
// today, and even those shift; future seasons' trade deadlines/moratorium
// windows aren't set by the league this far out. Populate as real dates are
// published — nothing reads this table yet (see the note in the schema doc:
// calendar/timing checks are the lowest-priority, not-yet-wired section).
export const SEASON_CALENDAR: Partial<Record<Season, SeasonCalendar>> = {}

export type AcquisitionMethod = 'draft' | 'trade' | 'free-agent' | 'waiver' | 'sign-and-trade' | 'extension'

export interface Acquisition {
  date: string // ISO
  method: AcquisitionMethod
}
