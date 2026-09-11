import { Season } from './types'
import { getTeamCapState, HeldTPE } from './team-cap-state'

const MS_PER_DAY = 1000 * 60 * 60 * 24
export const TPE_EXPIRING_SOON_DAYS = 30

export function daysRemaining(expires: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expires)
  expiry.setHours(0, 0, 0, 0)
  return Math.round((expiry.getTime() - today.getTime()) / MS_PER_DAY)
}

// TPEs are generally usable at any apron level — unlike cash, apron status
// doesn't block them outright. The two apron-specific effects: at/above the
// first apron a TPE loses its $250K cushion (immaterial here) and, more
// importantly, a TPE generated before the *previous* trade deadline becomes
// unusable. Approximating that deadline as Feb 1 of the season's start year
// (the app doesn't source exact deadline dates), and approximating each
// TPE's creation date as one year before its expiration (TPEs are 1-year-lived).
function priorSeasonDeadlineCutoff(season: Season): Date {
  const startYear = parseInt(season.split('-')[0], 10)
  return new Date(startYear, 1, 1) // Feb 1
}

function tpeGeneratedDate(expires: string): Date {
  const d = new Date(expires)
  d.setFullYear(d.getFullYear() - 1)
  return d
}

export interface HeldTPEView extends HeldTPE {
  locked: boolean
  daysLeft: number
  expiringSoon: boolean
}

/** A team's unexpired trade exceptions, soonest-to-expire first, each flagged for the over-first-apron lockout. */
export function getHeldTPEView(teamAbbr: string, season: Season, overFirstApron: boolean): HeldTPEView[] {
  const deadlineCutoff = priorSeasonDeadlineCutoff(season)
  return (getTeamCapState(teamAbbr, season)?.heldTPEs ?? [])
    .map((tpe) => {
      const daysLeft = daysRemaining(tpe.expires)
      return {
        ...tpe,
        daysLeft,
        expiringSoon: daysLeft <= TPE_EXPIRING_SOON_DAYS,
        locked: overFirstApron && tpeGeneratedDate(tpe.expires) < deadlineCutoff,
      }
    })
    .filter((tpe) => tpe.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}
