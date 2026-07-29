#!/usr/bin/env node
// Run on every PR into main (except the auto-update PR itself) so a feature
// branch that predates a daily scrape can never roll main's generated data
// back on merge. Fully-generated files are replaced wholesale with main's
// copy; files that mix hand-written code with a generated block only have
// the GENERATED:START..GENERATED:END region forced to match main.
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const FULLY_GENERATED = [
  'lib/player-data.ts',
  'lib/rookie-years.ts',
  'snapshots/players.json',
  'snapshots/draft-picks.json',
  'snapshots/contract-details.json',
  'snapshots/team-cap-state.json',
  'snapshots/scraped/clauses-raw.json',
  'snapshots/scraped/contract-details.json',
  'snapshots/scraped/draft-picks.json',
  'snapshots/scraped/players.json',
  'snapshots/scraped/rookie-years.json',
  'snapshots/scraped/team-cap-state.json',
  'snapshots/scraped/transactions.json',
  'snapshots/scraped/unresolved-acquisition.json',
  'snapshots/scraped/unresolved-draft-year.json',
  'snapshots/scraped/unresolved-guarantees.json',
]

const MARKER_FILES = [
  'lib/draft-picks.ts',
  'lib/team-cap-state.ts',
  'lib/contract-details.ts',
]

const START = '// GENERATED:START'
const END = '// GENERATED:END'

function mainContent(relPath) {
  return execSync(`git show origin/main:${relPath}`, { cwd: ROOT, encoding: 'utf-8' })
}

for (const rel of FULLY_GENERATED) {
  const abs = path.join(ROOT, rel)
  let upstream
  try {
    upstream = mainContent(rel)
  } catch {
    continue // not on main yet — nothing to sync
  }
  if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf-8') !== upstream) {
    fs.writeFileSync(abs, upstream)
    console.log(`synced ${rel} from main`)
  }
}

for (const rel of MARKER_FILES) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) continue
  let upstream
  try {
    upstream = mainContent(rel)
  } catch {
    continue
  }

  const mainStart = upstream.indexOf(START)
  const mainEnd = upstream.indexOf(END)
  if (mainStart === -1 || mainEnd === -1) continue
  const mainBlock = upstream.slice(mainStart, mainEnd + END.length)

  const current = fs.readFileSync(abs, 'utf-8')
  const curStart = current.indexOf(START)
  const curEnd = current.indexOf(END)
  if (curStart === -1 || curEnd === -1) continue

  const currentBlock = current.slice(curStart, curEnd + END.length)
  if (currentBlock === mainBlock) continue

  const next = current.slice(0, curStart) + mainBlock + current.slice(curEnd + END.length)
  fs.writeFileSync(abs, next)
  console.log(`synced generated block in ${rel} from main`)
}
