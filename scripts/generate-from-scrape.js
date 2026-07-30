#!/usr/bin/env node
/**
 * Reads the JSON written by scripts/scrape/run.py and regenerates the app's
 * data files. Refuses to write when validation fails.
 *
 *   node scripts/generate-from-scrape.js [--accept-large-diff]
 */
const fs = require('fs')
const path = require('path')
const { generatePlayerData } = require('./generate-player-data')
const { generateDraftPicks } = require('./generate-draft-picks')
const { generateContractDetails } = require('./generate-contract-details')
const { generateTeamCapState } = require('./generate-team-cap-state')

const SCRAPED = path.join(__dirname, '../snapshots/scraped')
const allowLargeDiff =
  process.argv.includes('--accept-large-diff') || process.env.ACCEPT_LARGE_DIFF === '1'

function read(name) {
  const file = path.join(SCRAPED, name)
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file} — run: python scripts/scrape/run.py`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

function readOptional(name, label) {
  const file = path.join(SCRAPED, name)
  if (!fs.existsSync(file)) {
    console.log(`Note: ${file} not found — skipping ${label} generation this run (run scripts/scrape/run.py to produce it)`)
    return null
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

function writeRookieYears(map) {
  const entries = Object.entries(map)
    .map(([name, year]) => `  ${JSON.stringify(name)}: ${year},`)
    .join('\n')
  const out = `// Auto-generated — do not edit by hand. Run scripts/generate-from-scrape.js.
export const PLAYER_ROOKIE_YEARS: Record<string, number> = {
${entries}
}
`
  fs.writeFileSync(path.join(__dirname, '../lib/rookie-years.ts'), out)
  console.log(`Generated ${Object.keys(map).length} rookie years to lib/rookie-years.ts`)
}

// Merges run.py's fetch/parse-time signals (staleSources, newUnresolved) with
// this script's own validate-and-diff results into one file the CI workflow
// reads to decide clean (auto-merge) vs. not (leave open for review), and
// into a human-readable PR body so a review, if needed, starts with "why"
// instead of a trip into the Actions log.
function writeRunStatus(diffResults) {
  const runStatus = readOptional('run-status.json', 'run status') ?? {
    written: [], staleSources: [], unresolved: { before: {}, after: {}, newUnresolved: 0, newByCategory: {} },
  }

  const warnings = diffResults.flatMap(([, result]) => result?.warnings ?? [])
  const diffSummaries = diffResults.map(([, result]) => result?.diffSummary).filter(Boolean)

  const staleSources = runStatus.staleSources ?? []
  const newUnresolved = runStatus.unresolved?.newUnresolved ?? 0
  const clean = staleSources.length === 0 && newUnresolved === 0 && warnings.length === 0

  const bodyLines = [
    '_Automated scrape of Basketball Reference, RealGM, Hoops Rumors, nbacaptracker.com, and SalarySwish.com._',
    '',
    '### Diff',
    ...diffSummaries.map((s) => `- ${s}`),
  ]
  if (staleSources.length > 0) {
    bodyLines.push('', '### Stale sources (kept last-good data)', ...staleSources.map((s) => `- ${s}`))
  }
  if (newUnresolved > 0) {
    const byCategory = Object.entries(runStatus.unresolved.newByCategory ?? {})
      .map(([k, v]) => `${k}: +${v}`)
      .join(', ')
    bodyLines.push('', `### ${newUnresolved} new unresolved entr${newUnresolved === 1 ? 'y' : 'ies'}`, `- ${byCategory}`)
  }
  if (warnings.length > 0) {
    bodyLines.push('', '### Warnings', ...warnings.map((w) => `- ${w}`))
  }
  bodyLines.push(
    '',
    clean
      ? '**Clean run — auto-merged.** No stale sources, no new unresolved entries, no validation warnings.'
      : '**Needs review** — see above for why this run did not auto-merge.'
  )

  const finalStatus = { ...runStatus, warnings, diffSummaries, clean }
  fs.writeFileSync(path.join(SCRAPED, 'run-status.json'), JSON.stringify(finalStatus, null, 2) + '\n')
  fs.writeFileSync(path.join(SCRAPED, 'pr-body.md'), bodyLines.join('\n') + '\n')
  console.log(`\nrun-status: clean=${clean}` + (clean ? '' : ` (staleSources=${staleSources.length}, newUnresolved=${newUnresolved}, warnings=${warnings.length})`))
}

// bbrefId rides along in the scraped file purely as a Python-side join key
// for enrichment (see run.py's build_players) — it isn't part of the app's
// Player model, so it's stripped here rather than let it leak into
// player-data.ts or (worse) the diff snapshot, where it would show up as a
// spurious 100%-churn field change the first time this runs.
const players = read('players.json').map(({ bbrefId, ...rest }) => rest)
const picks = read('draft-picks.json')
const rookieYears = read('rookie-years.json')

const diffResults = []
diffResults.push(['players', generatePlayerData(players, { allowLargeDiff })])
diffResults.push(['draft-picks', generateDraftPicks(picks, { allowLargeDiff })])
writeRookieYears(rookieYears)

const unresolved = read('unresolved-draft-year.json')
if (unresolved.length) {
  console.log(`\nNote: ${unresolved.length} players have no draft year (undrafted). ` +
    `Max-contract math is unavailable for them; everything else works.`)
}

const contractDetails = readOptional('contract-details.json', 'contract details (trade kickers, no-trade clauses)')
if (contractDetails) diffResults.push(['contract-details', generateContractDetails(contractDetails, { allowLargeDiff })])

const capState = readOptional('team-cap-state.json', 'team cap state (dead money, cap holds)')
if (capState) diffResults.push(['team-cap-state', generateTeamCapState(capState, { allowLargeDiff })])

for (const name of ['unresolved-acquisition.json', 'unresolved-guarantees.json', 'unresolved-signing.json']) {
  const unresolvedExtra = readOptional(name, name)
  if (unresolvedExtra && unresolvedExtra.length) {
    console.log(`Note: ${unresolvedExtra.length} entries in ${name} could not be matched to a player.`)
  }
}

writeRunStatus(diffResults)
