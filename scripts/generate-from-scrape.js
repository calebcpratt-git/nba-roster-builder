#!/usr/bin/env node
/**
 * Reads the JSON written by scripts/scrape/run.py and regenerates the app's
 * data files. Refuses to write when validation fails.
 *
 *   node scripts/generate-from-scrape.js [--accept-large-diff] [--rescue]
 */
const fs = require('fs')
const path = require('path')
const { generatePlayerData } = require('./generate-player-data')
const { generateDraftPicks } = require('./generate-draft-picks')
const { generateContractDetails } = require('./generate-contract-details')
const { generateTeamCapState } = require('./generate-team-cap-state')
const { generateFreeAgents } = require('./generate-free-agents')
const { generateAwards } = require('./generate-awards')
const { mergeDiffDetail } = require('./lib/validate-and-diff')

const SCRAPED = path.join(__dirname, '../snapshots/scraped')
const allowLargeDiff =
  process.argv.includes('--accept-large-diff') || process.env.ACCEPT_LARGE_DIFF === '1'
// A rescue is a partial, same-day follow-up to this morning's full run, not
// a new day's baseline. Each generate-*.js call always advances
// snapshots/<kind>.json to "current" as its own last step, so a rescue's own
// diff is computed against whatever the morning run (or an earlier rescue)
// already left there — a small, correct, incremental delta rather than a
// full day's diff. writeRunStatus below then merges that incremental detail
// onto whatever's already on disk in diff-<kind>.json instead of overwriting
// it, so the day's published diff stays cumulative.
//
// Earlier this froze snapshots/<kind>.json for the whole rescue (see git
// history) to keep that cumulative diff correct, but freezing it meant a day
// that ended on a rescue (no later non-rescue run to unfreeze it) left the
// next day's run diffing against a stale, pre-rescue baseline — reporting
// records the rescue had already added/removed as changing again on a day
// they didn't actually change. Confirmed live 2026-08-15: J.D. Davison and
// Sean Pedulla, added to the free-agent pool by a 2026-08-14 rescue, showed
// up as newly "added" again in the 2026-08-15 scheduled run's diff. Always
// advancing the snapshot keeps it truthful across day boundaries regardless
// of how a day's runs are split between morning and rescue.
const rescueMode = process.argv.includes('--rescue')
const genOptions = { allowLargeDiff }

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

  // One detail file per kind, mirroring unresolved-<category>.json, so the
  // /data dashboard can show which records actually changed behind each
  // diff summary line rather than just the +/-/~ counts.
  //
  // In rescue mode this run's records only cover the rescued source(s) —
  // every other kind's `result.detail` is trivially empty because its
  // snapshot baseline already matched the morning run's output. Overwriting
  // diff-<kind>.json with that empty detail would wipe out the morning's own
  // recorded diff. Instead, merge this run's detail onto whatever's already
  // on disk, so the file (and the summary line derived from it below)
  // reflects everything that changed today, not just this invocation.
  const diffSummaries = []
  for (const [kind, result] of diffResults) {
    if (!result?.detail) continue
    const existing = rescueMode ? readOptional(`diff-${kind}.json`, `${kind} diff`) : null
    const detail = existing ? mergeDiffDetail(kind, existing, result.detail) : result.detail
    fs.writeFileSync(
      path.join(SCRAPED, `diff-${kind}.json`),
      JSON.stringify(detail, null, 2) + '\n'
    )
    // "(of N)" in the original diffSummary just documents the baseline size
    // for context — preserved as-is, only the +/-/~ counts reflect the merge.
    const ofSuffix = result.diffSummary.match(/\(of .*\)$/)?.[0] ?? ''
    diffSummaries.push(
      `${kind}: +${detail.added.length} -${detail.removed.length} ~${detail.changed.length}` +
        (ofSuffix ? ` ${ofSuffix}` : '')
    )
  }

  const staleSources = runStatus.staleSources ?? []
  const newUnresolved = runStatus.unresolved?.newUnresolved ?? 0
  // A new unresolved entry means a clause the scraper found couldn't be
  // matched to a roster player, so it was skipped — nothing incorrect gets
  // written, a fact just doesn't make it in. That's not a correctness risk
  // like a stale source (silently kept last-good data) or a validation
  // warning (an actual conflict/oversized diff), so it doesn't block
  // auto-merge — it's only surfaced in the PR body below for visibility.
  const clean = staleSources.length === 0 && warnings.length === 0

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
      ? newUnresolved > 0
        ? `**Auto-merged.** ${newUnresolved} new unresolved entr${newUnresolved === 1 ? 'y was' : 'ies were'} skipped (see above) — no stale sources, no validation warnings.`
        : '**Clean run — auto-merged.** No stale sources, no new unresolved entries, no validation warnings.'
      : '**Needs review** — see above for why this run did not auto-merge.'
  )

  // Stamped here rather than in run.py so it marks when the generated lib/*.ts
  // files were actually rewritten, which is what the /data dashboard reports
  // as "data as of". Without it the dashboard can only fall back to file mtimes,
  // which a git checkout resets.
  const finalStatus = { ...runStatus, generatedAt: new Date().toISOString(), warnings, diffSummaries, clean }
  fs.writeFileSync(path.join(SCRAPED, 'run-status.json'), JSON.stringify(finalStatus, null, 2) + '\n')
  fs.writeFileSync(path.join(SCRAPED, 'pr-body.md'), bodyLines.join('\n') + '\n')
  console.log(`\nrun-status: clean=${clean}` + (clean ? '' : ` (staleSources=${staleSources.length}, newUnresolved=${newUnresolved}, warnings=${warnings.length})`))
}

const players = read('players.json')
const picks = read('draft-picks.json')
const rookieYears = read('rookie-years.json')

const diffResults = []
diffResults.push(['players', generatePlayerData(players, genOptions)])
diffResults.push(['draft-picks', generateDraftPicks(picks, genOptions)])
writeRookieYears(rookieYears)

const unresolved = read('unresolved-draft-year.json')
if (unresolved.length) {
  console.log(`\nNote: ${unresolved.length} players have no draft year (undrafted). ` +
    `Max-contract math is unavailable for them; everything else works.`)
}

const contractDetails = readOptional('contract-details.json', 'contract details (trade kickers, no-trade clauses)')
if (contractDetails) diffResults.push(['contract-details', generateContractDetails(contractDetails, genOptions)])

const capState = readOptional('team-cap-state.json', 'team cap state (dead money, cap holds)')
if (capState) diffResults.push(['team-cap-state', generateTeamCapState(capState, genOptions)])

const freeAgentPool = readOptional('free-agents.json', 'free agent pool (currently-unsigned players)')
if (freeAgentPool) diffResults.push(['free-agents', generateFreeAgents(freeAgentPool, genOptions)])

const awards = readOptional('awards.json', 'award history (MVP, DPOY, All-NBA)')
if (awards) diffResults.push(['awards', generateAwards(awards, genOptions)])

for (const name of ['unresolved-acquisition.json', 'unresolved-guarantees.json', 'unresolved-signing.json', 'unresolved-awards.json']) {
  const unresolvedExtra = readOptional(name, name)
  if (unresolvedExtra && unresolvedExtra.length) {
    console.log(`Note: ${unresolvedExtra.length} entries in ${name} could not be matched to a player.`)
  }
}

writeRunStatus(diffResults)
