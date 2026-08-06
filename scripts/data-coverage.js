// Reports what's actually populated in the generated lib/*.ts files, computed
// live from the files themselves — never hand-maintained. This exists because
// prose descriptions of "what's sourced" (skill docs, comments) go stale the
// moment a field is populated and nobody remembers to edit the description.
// Run: node scripts/data-coverage.js
//
// Regex-based rather than a real TS parse: these files are machine-generated
// with one entry per line by scripts/generate-*.js, so line-oriented counting
// is reliable and doesn't require pulling in a TS compiler for a report script.

const fs = require('fs')
const path = require('path')

const LIB = path.join(__dirname, '..', 'lib')
const read = (f) => fs.readFileSync(path.join(LIB, f), 'utf8')

function pct(n, total) {
  if (total === 0) return 'n/a'
  return `${n}/${total} (${Math.round((100 * n) / total)}%)`
}

function countOccurrences(text, regex) {
  return (text.match(regex) || []).length
}

function report(title, rows) {
  console.log(`\n## ${title}`)
  for (const [label, value] of rows) console.log(`  ${label}: ${value}`)
}

// --- player-data.ts ---
{
  const text = read('player-data.ts')
  const totalPlayers = countOccurrences(text, /^\s*\{ name: "/gm)
  const acquisition = countOccurrences(text, /acquisition: \{/g)
  const guarantees = countOccurrences(text, /guarantees: \{/g)
  const acqMethods = {}
  for (const m of text.matchAll(/acquisition: \{ date: '[^']+', method: '([^']+)'/g)) {
    acqMethods[m[1]] = (acqMethods[m[1]] || 0) + 1
  }
  report('lib/player-data.ts', [
    ['total players', totalPlayers],
    ['acquisition populated', pct(acquisition, totalPlayers)],
    ['  by method', JSON.stringify(acqMethods)],
    ['guarantees populated', pct(guarantees, totalPlayers)],
  ])
}

// --- contract-details.ts ---
{
  const text = read('contract-details.ts')
  const totalEntries = countOccurrences(text, /^\s*"[^"]+": \{/gm)
  const tradeBonusPct = countOccurrences(text, /tradeBonusPct:/g)
  const noTradeClause = countOccurrences(text, /noTradeClause:/g)
  const priorSeasonSalary = countOccurrences(text, /priorSeasonSalary:/g)
  const poisonPill = countOccurrences(text, /poisonPill:/g)
  const incentives = countOccurrences(text, /incentives: \{/g)
  const signedUnder = countOccurrences(text, /signedUnder:/g)
  const byType = {}
  for (const m of text.matchAll(/signedUnder: '([^']+)'/g)) {
    byType[m[1]] = (byType[m[1]] || 0) + 1
  }
  report('lib/contract-details.ts', [
    ['total entries', totalEntries],
    ['signedUnder populated', pct(signedUnder, totalEntries)],
    ['  by exception type', JSON.stringify(byType)],
    ['tradeBonusPct populated', pct(tradeBonusPct, totalEntries)],
    ['incentives populated', pct(incentives, totalEntries)],
    ['noTradeClause populated', noTradeClause],
    ['priorSeasonSalary populated', priorSeasonSalary],
    ['poisonPill populated', poisonPill],
  ])
}

// --- team-cap-state.ts ---
{
  const text = read('team-cap-state.ts')
  const teams = countOccurrences(text, /^\s{2}[A-Z]{3}: \{/gm)
  const seasonEntries = countOccurrences(text, /'\d{4}-\d{2}': \{/g)
  const deadMoney = countOccurrences(text, /deadMoney: \[[^\]]+\]/g)
  const capHolds = countOccurrences(text, /capHolds: \[[^\]]+\]/g)
  const heldTPEs = countOccurrences(text, /heldTPEs: \[[^\]]+\]/g)
  const apronAddon = countOccurrences(text, /apronAddon:/g)
  const hardCapped = countOccurrences(text, /hardCapped:/g)
  const cashLedger = countOccurrences(text, /cashLedger:/g)
  const exceptionsUsed = countOccurrences(text, /exceptionsUsed:/g)
  const ntmle = countOccurrences(text, /nonTaxpayerMLE: \{ signings: \[\{/g)
  const tmle = countOccurrences(text, /taxpayerMLE: \{ signings: \[\{/g)
  const roomMle = countOccurrences(text, /roomMLE: \{ signings: \[\{/g)
  const bae = countOccurrences(text, /biAnnual: \{ signings: \[\{/g)
  const dpe = countOccurrences(text, /dpe: \{ player:/g)
  const tradeExUsed = countOccurrences(text, /tradeExceptionsUsed: \[\{/g)
  report('lib/team-cap-state.ts', [
    ['teams present', `${teams}/30`],
    ['team-season entries', seasonEntries],
    ['  with non-empty deadMoney', deadMoney],
    ['  with non-empty capHolds', capHolds],
    ['  with non-empty heldTPEs', heldTPEs],
    ['  with apronAddon', apronAddon],
    ['  with hardCapped', hardCapped],
    ['  with cashLedger', cashLedger],
    ['  with exceptionsUsed', `${exceptionsUsed}/30`],
    ['    non-empty nonTaxpayerMLE signings', ntmle],
    ['    non-empty taxpayerMLE signings', tmle],
    ['    non-empty roomMLE signings', roomMle],
    ['    non-empty biAnnual signings', bae],
    ['    with dpe grant', dpe],
    ['    with tradeExceptionsUsed', tradeExUsed],
  ])
}

// --- season-calendar.ts ---
{
  const text = read('season-calendar.ts')
  const isEmpty = /SEASON_CALENDAR:.*=\s*\{\}/.test(text)
  report('lib/season-calendar.ts', [['SEASON_CALENDAR', isEmpty ? 'empty' : 'has entries — comment claiming "empty by design" needs review']])
}

// --- draft-picks.ts ---
{
  const file = path.join(LIB, 'draft-picks.ts')
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8')
    const picks = countOccurrences(text, /\{ teamOwner: /g)
    report('lib/draft-picks.ts', [['pick entries', picks]])
  }
}

console.log('\n(Counts are regex-based against the current file contents — always live, never a stored claim.)\n')
