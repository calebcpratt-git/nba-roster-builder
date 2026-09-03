// Server-side inputs for the /data dashboard that don't come from the schema
// manifest: how fresh the generated data is, and what the last scrape reported
// about itself.
//
// Reads the pipeline's own output rather than restating it, so "as of" and
// "was it clean" are whatever the scrape actually wrote.

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const ROOT = process.cwd()
const RUN_STATUS = path.join(ROOT, 'snapshots', 'scraped', 'run-status.json')
const SCRAPED_DIR = path.join(ROOT, 'snapshots', 'scraped')
const SCHEMA_MANIFEST = 'lib/data-schema.ts'

/** The generated files the daily scrape rewrites — mtime is the fallback "as of". */
export const GENERATED_DATA_FILES = [
  'lib/player-data.ts',
  'lib/contract-details.ts',
  'lib/team-cap-state.ts',
  'lib/draft-picks.ts',
  'lib/rookie-years.ts',
  'lib/free-agents.ts',
]

export interface ScrapeStatus {
  /** Written by generate-from-scrape.js. Null on data generated before that stamp existed. */
  generatedAt: string | null
  clean: boolean
  written: string[]
  staleSources: string[]
  warnings: string[]
  /** Per single-URL source in run.py's SOURCES dict: true if this run
   *  fetched it successfully, false if every retry failed. Null on data
   *  from before this field existed. */
  sourceFetches: Record<string, boolean> | null
  /** Per template source that fetches many pages in its own loop (per-team,
   *  per-player) instead of one runPyKey URL — the count attempted this run
   *  and the labels (team slug, player name, ...) of any that failed. Null
   *  entries mean nothing in that loop was attempted this run (e.g. every
   *  signing-incentives player was served from cache). */
  pageGroups: Record<string, { total: number; failed: string[] }> | null
  /** runPyKeys currently green because a --rescue click fetched them, not
   *  this morning's scheduled run. Reset to empty by the next full run. */
  rescuedSources: string[]
  diffSummaries: string[]
  /** Per kind: the summary line plus the actual records behind it, read from
   *  diff-<kind>.json (written by generate-from-scrape.js). Empty detail
   *  arrays mean the file predates this field or genuinely had no changes. */
  diffs: {
    kind: string
    summary: string
    added: Record<string, unknown>[]
    removed: Record<string, unknown>[]
    changed: { before: Record<string, unknown>; after: Record<string, unknown>; fields: string[] }[]
  }[]
  /** Per category: the standing backlog, and how it moved this run. The
   *  delta is the signal — a flat total is just names that never resolve
   *  (non-roster players), while a rising one means the scraper started
   *  missing people it used to match. */
  unresolved: {
    category: string
    before: number
    after: number
    delta: number
    meaning: string
    records: Record<string, unknown>[]
    /** Records in `records` that weren't present before this run — the
     *  identities behind `delta`, from run.py's new_unresolved_records(). */
    newRecords: Record<string, unknown>[]
  }[]
  newUnresolved: number
  /** Most recent mtime across the generated files — always available. */
  filesTouchedAt: string | null
  files: { file: string; mtime: string | null }[]
  error?: string
}

// What an unmatched record means differs by category, and the difference is
// the whole point: three of these are names that were never going to match,
// while `signing` is a real gap on players you do carry.
const UNRESOLVED_MEANING: Record<string, string> = {
  'draft-year': 'Undrafted players — they have no draft year to find. Expected, not a defect.',
  acquisition:
    'A transaction reported for someone with no row in player-data.ts: summer-league and Exhibit-10 signings, undrafted rookies, waived players. Enrichment only fills in existing players, never creates them.',
  guarantees:
    'A guarantee date or non-guaranteed entry for someone not currently on a SalarySwish team roster page.',
  signing:
    'These ARE rostered players — SalarySwish has no contract block on their player page yet (typically just-drafted rookies), so signedUnder and incentives stay empty for them. The one category here worth acting on.',
  awards:
    'An MVP/DPOY/All-NBA selection for someone with no row in player-data.ts — almost always a player who has since retired or left the league, since the awards window reaches back 5 seasons. Expected, not a defect.',
  'name-bridge':
    'A SalarySwish roster name that didn\'t squash-match, alias-match, or sitemap-match any name already in player-data.ts (see scripts/scrape/name_bridge.py) — mostly genuinely new players (rookies, camp invites, a free agent who just re-signed) with no prior canonical name to match against, occasionally a legal-vs-common-name pair worth adding to NAME_ALIASES. Not a defect by itself; only worth a look if the same real, already-known name keeps reappearing here run after run.',
  'no-current-salary':
    'A player SalarySwish still lists on a team\'s Active/Minors/Disabled/Inactive section, but with no confirmed current-season cap figure — an RFA/UFA tag sits in that cell instead, because their next deal isn\'t finalized (e.g. Jalen Duren, DET, confirmed live 2026-09). Dropped from player-data.ts rather than kept with an empty salary, specifically so free-agents.json (sourced from RealGM) can correctly pick them up as a free agent instead of them silently vanishing from both files at once.',
}

function readJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function readDiffs(diffSummaries: string[]): ScrapeStatus['diffs'] {
  return diffSummaries.map((summary) => {
    const kind = summary.split(':')[0]
    const detail = readJson(path.join(SCRAPED_DIR, `diff-${kind}.json`))
    return {
      kind,
      summary,
      added: detail?.added ?? [],
      removed: detail?.removed ?? [],
      changed: detail?.changed ?? [],
    }
  })
}

export function readScrapeStatus(): ScrapeStatus {
  const status = readJson(RUN_STATUS)

  const files = GENERATED_DATA_FILES.map((file) => {
    try {
      return { file, mtime: fs.statSync(path.join(ROOT, file)).mtime.toISOString() }
    } catch {
      return { file, mtime: null }
    }
  })
  const mtimes = files.map((f) => f.mtime).filter((m): m is string => m !== null)

  if (!status) {
    return {
      generatedAt: null,
      clean: false,
      written: [],
      staleSources: [],
      warnings: [],
      sourceFetches: null,
      pageGroups: null,
      rescuedSources: [],
      diffSummaries: [],
      diffs: [],
      unresolved: [],
      newUnresolved: 0,
      filesTouchedAt: mtimes.length ? mtimes.sort().at(-1)! : null,
      files,
      error: 'snapshots/scraped/run-status.json is missing or unreadable — run the scrape, or pull it from origin/main.',
    }
  }

  return {
    generatedAt: status.generatedAt ?? null,
    clean: status.clean === true,
    written: status.written ?? [],
    staleSources: status.staleSources ?? [],
    warnings: status.warnings ?? [],
    sourceFetches: status.sourceFetches ?? null,
    pageGroups: status.pageGroups ?? null,
    rescuedSources: status.rescuedSources ?? [],
    diffSummaries: status.diffSummaries ?? [],
    diffs: readDiffs(status.diffSummaries ?? []),
    unresolved: Object.entries(status.unresolved?.after ?? {}).map(([category, after]) => {
      const before = status.unresolved?.before?.[category] ?? 0
      const records = readJson(path.join(SCRAPED_DIR, `unresolved-${category}.json`))
      const newRecords = status.unresolved?.newRecords?.[category]
      return {
        category,
        before,
        after: after as number,
        delta: (after as number) - before,
        meaning: UNRESOLVED_MEANING[category] ?? 'Records a source reported that could not be matched.',
        records: Array.isArray(records) ? records : [],
        newRecords: Array.isArray(newRecords) ? newRecords : [],
      }
    }),
    newUnresolved: status.unresolved?.newUnresolved ?? 0,
    filesTouchedAt: mtimes.length ? mtimes.sort().at(-1)! : null,
    files,
  }
}

export interface PendingScrapeRun {
  number: number
  url: string
  createdAt: string
  body: string
}

export interface LatestWorkflowRun {
  status: string
  conclusion: string | null
  createdAt: string
  url: string
}

/** The daily update-nba-data.yml workflow always opens PRs from this branch
 *  (see .github/workflows/update-nba-data.yml) — a clean run merges and
 *  deletes it immediately, so if it still exists there's an open PR waiting
 *  on review right now. */
const AUTO_UPDATE_BRANCH = 'data/auto-update'

/** An open PR on data/auto-update, if today's (or any) scrape produced a
 *  not-clean run that's sitting unmerged — the dashboard otherwise only ever
 *  reflects what's been merged to main, so this is the only way to see "a
 *  run happened but is blocked" without leaving the app. Null means no gh
 *  auth/network — distinguished from "no open PR" (empty array, no throw) so
 *  the dashboard can say "couldn't check" instead of falsely implying clean. */
export function readPendingScrapeRun(): PendingScrapeRun | null | 'unknown' {
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'list', '--head', AUTO_UPDATE_BRANCH, '--state', 'open', '--json', 'number,url,createdAt,body', '--limit', '1'],
      { cwd: ROOT, encoding: 'utf8', timeout: 8000 },
    )
    const prs = JSON.parse(out)
    return prs[0] ?? null
  } catch {
    return 'unknown'
  }
}

/** Most recent run of the scheduled scrape workflow — catches the case where
 *  the run failed before it ever got as far as opening a PR (build broke,
 *  the scrape itself errored), which readPendingScrapeRun() can't see. */
export function readLatestWorkflowRun(): LatestWorkflowRun | null | 'unknown' {
  try {
    const out = execFileSync(
      'gh',
      ['run', 'list', '--workflow=update-nba-data.yml', '--limit', '1', '--json', 'status,conclusion,createdAt,url'],
      { cwd: ROOT, encoding: 'utf8', timeout: 8000 },
    )
    const runs = JSON.parse(out)
    return runs[0] ?? null
  } catch {
    return 'unknown'
  }
}

export interface SchemaChange {
  hash: string
  date: string
  subject: string
}

/** The manifest's own commit history. CLAUDE.md requires every schema or
 *  source change to update lib/data-schema.ts in the same commit, so this
 *  log *is* the schema change history — nothing to compute or go stale. */
export function readSchemaChangeLog(limit = 20): SchemaChange[] {
  try {
    const out = execFileSync(
      'git',
      ['log', '-n', String(limit), '--date=iso-strict', '--pretty=format:%H%x1f%ad%x1f%s', '--', SCHEMA_MANIFEST],
      { cwd: ROOT, encoding: 'utf8' },
    )
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, date, subject] = line.split('\x1f')
        return { hash, date, subject }
      })
  } catch {
    return []
  }
}
