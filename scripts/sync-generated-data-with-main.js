#!/usr/bin/env node
// Run on every PR into main (except the auto-update PR itself) so a feature
// branch that predates a daily scrape can never roll main's generated data
// back on merge. Fully-generated files are replaced wholesale with main's
// copy; files that mix hand-written code with a generated block only have
// the GENERATED:START..GENERATED:END region forced to match main.
//
// IMPORTANT: this only overwrites a file/block if THIS BRANCH hasn't
// touched it since diverging from main. If the branch itself committed a
// fresh scrape (e.g. a manual run.py + generate-from-scrape.js run before
// opening a PR), that data is newer than main and must NOT be reverted —
// see the 2026-07-31 incident where a first successful SalarySwish-
// integrated scrape on qa-repo was silently discarded by this exact
// script because it blindly trusted main over the branch.
// branchTouchedFile() below is the fix: skip any file the branch has
// modified since its merge-base with main, and only force-sync files the
// branch left completely untouched.
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

// The commit this branch forked from main at. Every "has the branch
// touched this file" check below is relative to this point, not to main's
// current tip — a branch shouldn't be penalized for main moving on after
// the fork.
let mergeBase
try {
  mergeBase = execSync('git merge-base HEAD origin/main', { cwd: ROOT, encoding: 'utf-8' }).trim()
} catch {
  mergeBase = null
}

// True if this branch has its own commit(s) touching `relPath` since it
// forked from main. A branch that's touched a file has deliberately taken
// ownership of it for this PR (e.g. a manual scrape run before opening
// the PR) — forcing main's copy over that would silently discard real
// work, per the 2026-07-31 incident in the header comment above. A branch
// that hasn't touched the file is the normal case this script exists
// for: it's just sitting there while the daily cron moves main forward,
// and syncing is exactly the right thing to do.
function branchTouchedFile(relPath) {
  if (!mergeBase) return false // no merge-base found — fail open to the old (sync-everything) behavior
  try {
    const diff = execSync(`git diff --name-only ${mergeBase} HEAD -- ${relPath}`, { cwd: ROOT, encoding: 'utf-8' })
    return diff.trim().length > 0
  } catch {
    return false
  }
}

for (const rel of FULLY_GENERATED) {
  if (branchTouchedFile(rel)) {
    console.log(`skipped ${rel} — branch has its own changes to this file since forking from main`)
    continue
  }
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
  if (branchTouchedFile(rel)) {
    console.log(`skipped ${rel} — branch has its own changes to this file since forking from main`)
    continue
  }
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
