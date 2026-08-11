// Server-side inputs for the /data dashboard that don't come from the schema
// manifest: how fresh the generated data is, and what the last scrape reported
// about itself.
//
// Reads the pipeline's own output rather than restating it, so "as of" and
// "was it clean" are whatever the scrape actually wrote.

import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const RUN_STATUS = path.join(ROOT, 'snapshots', 'scraped', 'run-status.json')
const DRIFT_REPORT = path.join(ROOT, 'snapshots', 'schema-drift.json')
const SCRAPED_DIR = path.join(ROOT, 'snapshots', 'scraped')

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
  diffSummaries: string[]
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
    'A guarantee date or non-guaranteed entry for someone not under contract on the BBRef contracts page.',
  signing:
    'These ARE rostered players — SalarySwish has no contract block on their player page yet (typically just-drafted rookies), so signedUnder and incentives stay empty for them. The one category here worth acting on.',
}

function readJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
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
      diffSummaries: [],
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
    diffSummaries: status.diffSummaries ?? [],
    unresolved: Object.entries(status.unresolved?.after ?? {}).map(([category, after]) => {
      const before = status.unresolved?.before?.[category] ?? 0
      const records = readJson(path.join(SCRAPED_DIR, `unresolved-${category}.json`))
      return {
        category,
        before,
        after: after as number,
        delta: (after as number) - before,
        meaning: UNRESOLVED_MEANING[category] ?? 'Records a source reported that could not be matched.',
        records: Array.isArray(records) ? records : [],
      }
    }),
    newUnresolved: status.unresolved?.newUnresolved ?? 0,
    filesTouchedAt: mtimes.length ? mtimes.sort().at(-1)! : null,
    files,
  }
}

export interface DriftReport {
  checkedAt: string
  findings: { kind: string; detail: string }[]
}

/** The last `pnpm schema:check` result, if one has been run. */
export function readDriftReport(): DriftReport | null {
  const report = readJson(DRIFT_REPORT)
  if (!report || typeof report.checkedAt !== 'string') return null
  return { checkedAt: report.checkedAt, findings: report.findings ?? [] }
}
