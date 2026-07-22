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

const players = read('players.json')
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
