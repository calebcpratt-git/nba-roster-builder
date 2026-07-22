const fs = require('fs')
const path = require('path')

const SALARY_CEILING = 80_000_000
const DIFF_ERROR_RATIO = 0.3

// Roster minimums are a broken-scraper tripwire, not a CBA compliance check —
// they only need to be tight enough to catch a parser returning garbage.
//
// In the offseason (late June through September) rosters are legitimately
// incomplete: teams sign up to the 14-man minimum during training camp, and in
// July it's normal for several teams to sit at 12. In-season the floor is 13,
// not 14, because the CBA lets a team carry 13 for up to two weeks at a time —
// a 14 threshold would false-fail on a legal roster.
const MIN_ROSTER_SIZE_OFFSEASON = 12
const MIN_ROSTER_SIZE_IN_SEASON = 13

function isOffseason(date = new Date()) {
  const month = date.getMonth() + 1 // 1-12
  const day = date.getDate()
  if (month >= 7 && month <= 9) return true    // July–September
  if (month === 6 && day >= 20) return true    // draft + free agency gut rosters
  return false
}

function minRosterSize(date = new Date()) {
  return isOffseason(date) ? MIN_ROSTER_SIZE_OFFSEASON : MIN_ROSTER_SIZE_IN_SEASON
}

// TEAM_ABBREVIATIONS is a runtime const, not just a type, but it lives in a
// .ts file with no ts-node/tsx in this project's toolchain — so it's
// extracted from source text rather than duplicated here or required as-is.
function loadTeamAbbreviations() {
  const typesPath = path.join(__dirname, '../../lib/types.ts')
  const content = fs.readFileSync(typesPath, 'utf-8')
  const match = content.match(/export const TEAM_ABBREVIATIONS = \[([\s\S]*?)\] as const/)
  if (!match) {
    throw new Error('Could not find TEAM_ABBREVIATIONS in lib/types.ts')
  }
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^['"]|['"]$/g, ''))
}

function validatePlayers(records, errors, now = new Date()) {
  const TEAM_ABBREVIATIONS = loadTeamAbbreviations()
  const teamSet = new Set(TEAM_ABBREVIATIONS)
  const countByTeam = new Map()

  records.forEach((record, i) => {
    if (!record.name || typeof record.name !== 'string' || !record.name.trim()) {
      errors.push(`players[${i}]: missing or empty "name"`)
    }
    if (!record.team || typeof record.team !== 'string' || !record.team.trim()) {
      errors.push(`players[${i}]: missing or empty "team"`)
    } else {
      if (!teamSet.has(record.team)) {
        errors.push(`players[${i}] (${record.name ?? 'unknown'}): team "${record.team}" is not in TEAM_ABBREVIATIONS`)
      }
      countByTeam.set(record.team, (countByTeam.get(record.team) ?? 0) + 1)
    }

    const salary = record.salary ?? {}
    for (const [season, value] of Object.entries(salary)) {
      if (value === null || value === undefined) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > SALARY_CEILING) {
        errors.push(`players[${i}] (${record.name ?? 'unknown'}): salary.${season} = ${value} is not null or a positive number under $${SALARY_CEILING}`)
      }
    }
  })

  const floor = minRosterSize(now)
  const phase = isOffseason(now) ? 'offseason' : 'in-season'
  for (const abbr of TEAM_ABBREVIATIONS) {
    if (abbr === 'CHA') continue // intentionally excluded — legacy code, never populated
    const count = countByTeam.get(abbr) ?? 0
    if (count < floor) {
      errors.push(`team "${abbr}" has only ${count} player records (expected at least ${floor} — ${phase})`)
    }
  }
}

function validateDraftPicks(records, errors) {
  const VALID_ROUNDS = new Set(['First Round', 'Second Round'])

  records.forEach((record, i) => {
    if (!record.teamOwner || typeof record.teamOwner !== 'string' || !record.teamOwner.trim()) {
      errors.push(`draft-picks[${i}]: missing or empty "teamOwner"`)
    }
    if (
      typeof record.year !== 'number' ||
      !Number.isInteger(record.year) ||
      record.year < 2025 ||
      record.year > 2035
    ) {
      errors.push(`draft-picks[${i}] (${record.teamOwner ?? 'unknown'}): year "${record.year}" is not a plausible 4-digit year (2025-2035)`)
    }
    if (!VALID_ROUNDS.has(record.round)) {
      errors.push(`draft-picks[${i}] (${record.teamOwner ?? 'unknown'}): round "${record.round}" must be 'First Round' or 'Second Round'`)
    }
  })
}

// Best-effort natural key per kind — this data has no real unique id, so
// identity is inferred from the fields that stay stable across a normal
// update (name for players; the pick's origin/slot for draft picks).
function recordKey(kind, record) {
  if (kind === 'players') {
    return String(record.name).trim().toLowerCase()
  }
  return [record.teamOwner, record.year, record.round, record.teamFrom, record.pickNumber, record.pickPool]
    .map((v) => String(v))
    .join('|')
}

function buildIndex(kind, records) {
  const index = new Map()
  for (const record of records) {
    const key = recordKey(kind, record)
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(record)
  }
  return index
}

function diffRecords(kind, records, previousRecords) {
  const prevIndex = buildIndex(kind, previousRecords)
  const newIndex = buildIndex(kind, records)

  let added = 0
  let removed = 0
  let changed = 0

  for (const [key, newList] of newIndex) {
    const prevList = prevIndex.get(key) ?? []
    const max = Math.max(newList.length, prevList.length)
    for (let i = 0; i < max; i++) {
      const newRecord = newList[i]
      const prevRecord = prevList[i]
      if (newRecord && prevRecord) {
        if (JSON.stringify(newRecord) !== JSON.stringify(prevRecord)) changed++
      } else if (newRecord && !prevRecord) {
        added++
      } else if (!newRecord && prevRecord) {
        removed++
      }
    }
  }

  for (const [key, prevList] of prevIndex) {
    if (!newIndex.has(key)) removed += prevList.length
  }

  return { added, removed, changed }
}

/**
 * @param {object} input
 * @param {'players' | 'draft-picks'} input.kind
 * @param {any[]} input.records         - the new records about to be written
 * @param {any[]} input.previousRecords - parsed from the CURRENT generated file, for diffing
 * @param {boolean} [input.allowLargeDiff] - opt in to a diff above the threshold.
 *   Defaults to the --accept-large-diff CLI flag or ACCEPT_LARGE_DIFF=1, so an
 *   unattended scheduled run still blocks unless someone deliberately says so.
 * @param {Date} [input.now] - injectable clock, for testing the offseason branch
 * @returns {{ ok: boolean, errors: string[], warnings: string[], diffSummary: string }}
 */
function largeDiffAcceptedFromEnv() {
  return process.argv.includes('--accept-large-diff') || process.env.ACCEPT_LARGE_DIFF === '1'
}

function validateAndDiff({ kind, records, previousRecords, allowLargeDiff, now }) {
  const errors = []
  const warnings = []
  previousRecords = previousRecords ?? []
  allowLargeDiff = allowLargeDiff ?? largeDiffAcceptedFromEnv()
  now = now ?? new Date()

  if (kind === 'players') {
    validatePlayers(records, errors, now)
  } else if (kind === 'draft-picks') {
    validateDraftPicks(records, errors)
  } else {
    throw new Error(`Unknown kind: ${kind}`)
  }

  const { added, removed, changed } = diffRecords(kind, records, previousRecords)
  const diffSummary =
    previousRecords.length === 0
      ? `${kind}: initial import of ${records.length} records (no prior snapshot to diff against)`
      : `${kind}: +${added} -${removed} ~${changed} (of ${previousRecords.length})`

  if (previousRecords.length > 0) {
    const churn = added + removed + changed
    const ratio = churn / previousRecords.length
    if (ratio > DIFF_ERROR_RATIO) {
      const scale =
        `${kind}: diff too large — ${churn} of ${previousRecords.length} previous records changed ` +
        `(${(ratio * 100).toFixed(1)}%, threshold ${DIFF_ERROR_RATIO * 100}%)`
      if (allowLargeDiff) {
        // Explicitly acknowledged by the caller — e.g. a first import, or a
        // catch-up run after the draft and free agency.
        warnings.push(`${scale} — proceeding because a large diff was explicitly accepted`)
      } else {
        errors.push(
          `${scale} — this usually means a broken upstream parser, not real-world churn. ` +
            `If the change is genuine (first import, post-draft or post-free-agency catch-up), ` +
            `re-run with --accept-large-diff (or ACCEPT_LARGE_DIFF=1).`
        )
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    diffSummary,
  }
}

module.exports = { validateAndDiff, isOffseason, minRosterSize }
