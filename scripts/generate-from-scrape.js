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

// bbrefId rides along in the scraped file purely as a Python-side join key
// for enrichment (see run.py's build_players) — it isn't part of the app's
// Player model, so it's stripped here rather than let it leak into
// player-data.ts or (worse) the diff snapshot, where it would show up as a
// spurious 100%-churn field change the first time this runs.
const players = read('players.json').map(({ bbrefId, ...rest }) => rest)
const picks = read('draft-picks.json')
const rookieYears = read('rookie-years.json')

generatePlayerData(players, { allowLargeDiff })
generateDraftPicks(picks, { allowLargeDiff })
writeRookieYears(rookieYears)

const unresolved = read('unresolved-draft-year.json')
if (unresolved.length) {
  console.log(`\nNote: ${unresolved.length} players have no draft year (undrafted). ` +
    `Max-contract math is unavailable for them; everything else works.`)
}

const contractDetails = readOptional('contract-details.json', 'contract details (trade kickers, no-trade clauses)')
if (contractDetails) generateContractDetails(contractDetails, { allowLargeDiff })

const capState = readOptional('team-cap-state.json', 'team cap state (dead money, cap holds)')
if (capState) generateTeamCapState(capState, { allowLargeDiff })

for (const name of ['unresolved-acquisition.json', 'unresolved-guarantees.json', 'unresolved-signing.json']) {
  const unresolvedExtra = readOptional(name, name)
  if (unresolvedExtra && unresolvedExtra.length) {
    console.log(`Note: ${unresolvedExtra.length} entries in ${name} could not be matched to a player.`)
  }
}
