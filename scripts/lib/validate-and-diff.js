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

    // $0 is a legitimate cap hit, not just for two-way contracts (whose
    // salary counts as cash, not a cap charge) but also confirmed live on
    // at least one Inactive-list rookie (Dillon Mitchell) whose deal isn't
    // yet counting against the cap at all. getEffectiveSalary treats a $0
    // salary as zero cap impact regardless, so accepting it here doesn't
    // risk a scraper bug slipping through unnoticed — a genuinely broken
    // scrape shows up as a missing/negative/absurd value instead, which the
    // checks below still catch.
    const salary = record.salary ?? {}
    for (const [season, value] of Object.entries(salary)) {
      if (value === null || value === undefined) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > SALARY_CEILING) {
        errors.push(`players[${i}] (${record.name ?? 'unknown'}): salary.${season} = ${value} is not null or a non-negative number under $${SALARY_CEILING}`)
      }
    }

    const VALID_GUARANTEE_STATUS = new Set(['full', 'partial', 'non-guaranteed'])
    for (const [season, g] of Object.entries(record.guarantees ?? {})) {
      if (g != null && !VALID_GUARANTEE_STATUS.has(g.status)) {
        errors.push(`players[${i}] (${record.name ?? 'unknown'}): guarantees.${season}.status "${g.status}" is not 'full'|'partial'|'non-guaranteed'`)
      }
    }

    if (record.contractType !== undefined && record.contractType !== 'two-way') {
      errors.push(`players[${i}] (${record.name ?? 'unknown'}): contractType "${record.contractType}" must be 'two-way' or absent`)
    }

    const VALID_ACQUISITION_METHODS = new Set(['draft', 'trade', 'free-agent', 'waiver', 'sign-and-trade', 'extension'])
    ;(record.acquisitionHistory ?? []).forEach((a, j) => {
      if (!VALID_ACQUISITION_METHODS.has(a.method)) {
        errors.push(`players[${i}] (${record.name ?? 'unknown'}): acquisitionHistory[${j}].method "${a.method}" is not a recognized method`)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '')) {
        errors.push(`players[${i}] (${record.name ?? 'unknown'}): acquisitionHistory[${j}].date "${a.date}" is not in 'YYYY-MM-DD' format`)
      }
      if (!a.team || !teamSet.has(a.team)) {
        errors.push(`players[${i}] (${record.name ?? 'unknown'}): acquisitionHistory[${j}].team "${a.team}" is not in TEAM_ABBREVIATIONS`)
      }
    })
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

const VALID_SIGNED_UNDER = new Set([
  'minimum', 'rookie-scale', 'bird', 'early-bird', 'non-bird',
  'non-taxpayer-mle', 'taxpayer-mle', 'room-mle', 'bi-annual', 'cap-room', 'max',
])

function validateContractDetails(records, errors) {
  records.forEach((record, i) => {
    if (!record.name || typeof record.name !== 'string' || !record.name.trim()) {
      errors.push(`contract-details[${i}]: missing or empty "name"`)
    }
    if (record.tradeBonusPct !== undefined) {
      if (typeof record.tradeBonusPct !== 'number' || record.tradeBonusPct < 0 || record.tradeBonusPct > 15) {
        errors.push(`contract-details[${i}] (${record.name ?? 'unknown'}): tradeBonusPct "${record.tradeBonusPct}" is not a number between 0 and 15 (CBA caps trade kickers at 15%)`)
      }
    }
    if (record.noTradeClause !== undefined && typeof record.noTradeClause !== 'boolean') {
      errors.push(`contract-details[${i}] (${record.name ?? 'unknown'}): noTradeClause must be boolean`)
    }
    if (record.signedUnder !== undefined && !VALID_SIGNED_UNDER.has(record.signedUnder)) {
      errors.push(`contract-details[${i}] (${record.name ?? 'unknown'}): signedUnder "${record.signedUnder}" is not a recognized exception type`)
    }
    for (const [season, v] of Object.entries(record.incentives ?? {})) {
      if (!/^\d{4}-\d{2}$/.test(season)) {
        errors.push(`contract-details[${i}] (${record.name ?? 'unknown'}): incentives season "${season}" is not in 'YYYY-YY' format`)
      }
      for (const key of ['likely', 'unlikely']) {
        const amt = v[key]
        if (typeof amt !== 'number' || amt < 0 || amt > SALARY_CEILING) {
          errors.push(`contract-details[${i}] (${record.name ?? 'unknown'}): incentives.${season}.${key} "${amt}" is not a number between 0 and $${SALARY_CEILING}`)
        }
      }
    }
  })
}

const VALID_FA_TYPES = new Set(['U', 'R'])
const VALID_BIRD_RIGHTS = new Set(['non-bird', 'early-bird', 'full-bird'])

function validateFreeAgents(records, errors) {
  const TEAM_ABBREVIATIONS = loadTeamAbbreviations()
  const teamSet = new Set(TEAM_ABBREVIATIONS)
  records.forEach((record, i) => {
    if (!record.name || typeof record.name !== 'string' || !record.name.trim()) {
      errors.push(`free-agents[${i}]: missing or empty "name"`)
    }
    if (!record.priorTeam || !teamSet.has(record.priorTeam)) {
      errors.push(`free-agents[${i}] (${record.name ?? 'unknown'}): priorTeam "${record.priorTeam}" is not in TEAM_ABBREVIATIONS`)
    }
    if (!VALID_FA_TYPES.has(record.faType)) {
      errors.push(`free-agents[${i}] (${record.name ?? 'unknown'}): faType "${record.faType}" must be 'U' or 'R'`)
    }
    if (record.birdRights != null && !VALID_BIRD_RIGHTS.has(record.birdRights)) {
      errors.push(`free-agents[${i}] (${record.name ?? 'unknown'}): birdRights "${record.birdRights}" is not a recognized value`)
    }
  })
}

function validateTeamCapState(records, errors) {
  const TEAM_ABBREVIATIONS = loadTeamAbbreviations()
  const teamSet = new Set(TEAM_ABBREVIATIONS)
  records.forEach((record, i) => {
    if (!record.team || !teamSet.has(record.team)) {
      errors.push(`team-cap-state[${i}]: team "${record.team}" is not in TEAM_ABBREVIATIONS`)
    }
    if (!/^\d{4}-\d{2}$/.test(record.season ?? '')) {
      errors.push(`team-cap-state[${i}] (${record.team ?? 'unknown'}): season "${record.season}" is not in 'YYYY-YY' format`)
    }
    for (const dm of record.deadMoney ?? []) {
      if (typeof dm.amount !== 'number' || dm.amount <= 0 || dm.amount > SALARY_CEILING) {
        errors.push(`team-cap-state[${i}] (${record.team}): deadMoney entry for "${dm.player}" has implausible amount ${dm.amount}`)
      }
    }
    for (const t of record.heldTPEs ?? []) {
      if (typeof t.amount !== 'number' || t.amount < 0 || t.amount > SALARY_CEILING) {
        errors.push(`team-cap-state[${i}] (${record.team}): heldTPE "${t.id}" has implausible amount ${t.amount}`)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.expires ?? '')) {
        errors.push(`team-cap-state[${i}] (${record.team}): heldTPE "${t.id}" expires "${t.expires}" is not in 'YYYY-MM-DD' format`)
      }
    }
    if (record.hardCapped !== undefined && ![1, 2].includes(record.hardCapped.apron)) {
      errors.push(`team-cap-state[${i}] (${record.team}): hardCapped.apron "${record.hardCapped.apron}" must be 1 or 2`)
    }
    if (record.apronAddon !== undefined && (typeof record.apronAddon !== 'number' || record.apronAddon < 0 || record.apronAddon > SALARY_CEILING)) {
      errors.push(`team-cap-state[${i}] (${record.team}): apronAddon "${record.apronAddon}" is not a number between 0 and $${SALARY_CEILING}`)
    }
    if (record.cashLedger !== undefined) {
      for (const key of ['availableToSend', 'availableToReceive']) {
        const amt = record.cashLedger[key]
        if (typeof amt !== 'number' || amt < 0 || amt > SALARY_CEILING) {
          errors.push(`team-cap-state[${i}] (${record.team}): cashLedger.${key} "${amt}" is not a number between 0 and $${SALARY_CEILING}`)
        }
      }
    }
    if (record.exceptionsUsed !== undefined) {
      for (const key of ['nonTaxpayerMLE', 'taxpayerMLE', 'roomMLE', 'biAnnual']) {
        for (const s of record.exceptionsUsed[key]?.signings ?? []) {
          if (typeof s.amount !== 'number' || s.amount <= 0 || s.amount > SALARY_CEILING) {
            errors.push(`team-cap-state[${i}] (${record.team}): exceptionsUsed.${key} signing for "${s.player}" has implausible amount ${s.amount}`)
          }
        }
      }
      for (const u of record.exceptionsUsed.tradeExceptionsUsed ?? []) {
        if (typeof u.amount !== 'number' || u.amount <= 0 || u.amount > SALARY_CEILING) {
          errors.push(`team-cap-state[${i}] (${record.team}): exceptionsUsed.tradeExceptionsUsed for "${u.usedByPlayer}" has implausible amount ${u.amount}`)
        }
      }
    }
  })
}

const VALID_AWARD_TYPES = new Set(['MVP', 'DPOY', 'All-NBA-1', 'All-NBA-2', 'All-NBA-3'])

function validateAwards(records, errors) {
  records.forEach((record, i) => {
    if (!record.name || typeof record.name !== 'string' || !record.name.trim()) {
      errors.push(`awards[${i}]: missing or empty "name"`)
    }
    if (!/^\d{4}-\d{2}$/.test(record.season ?? '')) {
      errors.push(`awards[${i}] (${record.name ?? 'unknown'}): season "${record.season}" is not in 'YYYY-YY' format`)
    }
    if (!VALID_AWARD_TYPES.has(record.award)) {
      errors.push(`awards[${i}] (${record.name ?? 'unknown'}): award "${record.award}" is not a recognized award type`)
    }
  })
}

// Best-effort natural key per kind — this data has no real unique id, so
// identity is inferred from the fields that stay stable across a normal
// update (name for players; the pick's origin/slot for draft picks).
function recordKey(kind, record) {
  if (kind === 'players' || kind === 'contract-details' || kind === 'free-agents') {
    return String(record.name).trim().toLowerCase()
  }
  if (kind === 'team-cap-state') {
    return `${record.team}|${record.season}`
  }
  if (kind === 'awards') {
    return `${record.name}|${record.season}|${record.award}`.toLowerCase()
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

// Top-level keys that differ between two versions of the same record — the
// "what changed" behind a changed++ count, without a full recursive diff.
function changedFields(prevRecord, newRecord) {
  const keys = new Set([...Object.keys(prevRecord), ...Object.keys(newRecord)])
  const fields = []
  for (const key of keys) {
    if (JSON.stringify(prevRecord[key]) !== JSON.stringify(newRecord[key])) fields.push(key)
  }
  return fields
}

function diffRecords(kind, records, previousRecords) {
  const prevIndex = buildIndex(kind, previousRecords)
  const newIndex = buildIndex(kind, records)

  let added = 0
  let removed = 0
  let changed = 0
  const detail = { added: [], removed: [], changed: [] }

  for (const [key, newList] of newIndex) {
    const prevList = prevIndex.get(key) ?? []
    const max = Math.max(newList.length, prevList.length)
    for (let i = 0; i < max; i++) {
      const newRecord = newList[i]
      const prevRecord = prevList[i]
      if (newRecord && prevRecord) {
        if (JSON.stringify(newRecord) !== JSON.stringify(prevRecord)) {
          changed++
          detail.changed.push({ before: prevRecord, after: newRecord, fields: changedFields(prevRecord, newRecord) })
        }
      } else if (newRecord && !prevRecord) {
        added++
        detail.added.push(newRecord)
      } else if (!newRecord && prevRecord) {
        removed++
        detail.removed.push(prevRecord)
      }
    }
  }

  for (const [key, prevList] of prevIndex) {
    if (!newIndex.has(key)) {
      removed += prevList.length
      detail.removed.push(...prevList)
    }
  }

  return { added, removed, changed, detail }
}

// Composes two same-day diff details into one — used when a same-source
// rescue runs after the morning's regular scrape already produced a diff.
// The rescue's own diff is computed against the same fixed baseline (see
// generate-from-scrape.js's skipSnapshotUpdate), so `earlier` and `later`
// describe two independent deltas off that one baseline, keyed by identity
// so a record touched by both collapses into a single entry instead of
// appearing twice.
function mergeDiffDetail(kind, earlier, later) {
  const keyOf = (record) => recordKey(kind, record)
  const addedByKey = new Map(earlier.added.map((r) => [keyOf(r), r]))
  const removedByKey = new Map(earlier.removed.map((r) => [keyOf(r), r]))
  const changedByKey = new Map(earlier.changed.map((c) => [keyOf(c.after), { ...c }]))

  for (const record of later.added) {
    const key = keyOf(record)
    if (removedByKey.has(key)) {
      removedByKey.delete(key) // removed earlier today, back now — nets out
    } else if (changedByKey.has(key)) {
      changedByKey.get(key).after = record
    } else {
      addedByKey.set(key, record)
    }
  }

  for (const record of later.removed) {
    const key = keyOf(record)
    if (addedByKey.has(key)) {
      addedByKey.delete(key) // added earlier today, removed now — nets out
    } else if (changedByKey.has(key)) {
      removedByKey.set(key, changedByKey.get(key).before)
      changedByKey.delete(key)
    } else {
      removedByKey.set(key, record)
    }
  }

  for (const change of later.changed) {
    const key = keyOf(change.after)
    if (addedByKey.has(key)) {
      addedByKey.set(key, change.after) // still "added today" — just a newer version
    } else if (changedByKey.has(key)) {
      const existing = changedByKey.get(key)
      existing.after = change.after
      existing.fields = Array.from(new Set([...existing.fields, ...change.fields]))
    } else {
      changedByKey.set(key, { ...change })
    }
  }

  return {
    added: [...addedByKey.values()],
    removed: [...removedByKey.values()],
    changed: [...changedByKey.values()],
  }
}

/**
 * @param {object} input
 * @param {'players' | 'draft-picks' | 'contract-details' | 'team-cap-state' | 'free-agents' | 'awards'} input.kind
 * @param {any[]} input.records         - the new records about to be written
 * @param {any[]} input.previousRecords - parsed from the CURRENT generated file, for diffing
 * @param {boolean} [input.allowLargeDiff] - opt in to a diff above the threshold.
 *   Defaults to the --accept-large-diff CLI flag or ACCEPT_LARGE_DIFF=1, so an
 *   unattended scheduled run still blocks unless someone deliberately says so.
 * @param {Date} [input.now] - injectable clock, for testing the offseason branch
 * @returns {{ ok: boolean, errors: string[], warnings: string[], diffSummary: string,
 *   detail: { added: any[], removed: any[], changed: { before: any, after: any, fields: string[] }[] } }}
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
  } else if (kind === 'contract-details') {
    validateContractDetails(records, errors)
  } else if (kind === 'team-cap-state') {
    validateTeamCapState(records, errors)
  } else if (kind === 'free-agents') {
    validateFreeAgents(records, errors)
  } else if (kind === 'awards') {
    validateAwards(records, errors)
  } else {
    throw new Error(`Unknown kind: ${kind}`)
  }

  const { added, removed, changed, detail } = diffRecords(kind, records, previousRecords)
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
    detail,
  }
}

module.exports = { validateAndDiff, isOffseason, minRosterSize, mergeDiffDetail }
