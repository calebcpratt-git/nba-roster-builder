const fs = require('fs')
const path = require('path')
const { validateAndDiff } = require('./lib/validate-and-diff')
const { loadPreviousSnapshot, saveSnapshot } = require('./lib/snapshots')

/**
 * @typedef {{ name: string, season: string, award: 'MVP'|'DPOY'|'All-NBA-1'|'All-NBA-2'|'All-NBA-3' }} AwardRecord
 * @param {AwardRecord[]} records
 * @returns {string}
 */
function buildAwardsTs(records) {
  const byName = new Map()
  for (const r of records) {
    if (!byName.has(r.name)) byName.set(r.name, [])
    byName.get(r.name).push(r)
  }

  const entries = [...byName.entries()]
    .map(([name, awards]) => {
      const sorted = [...awards].sort((a, b) => (a.season < b.season ? -1 : a.season > b.season ? 1 : 0))
      const serialized = sorted.map((a) => `{ season: '${a.season}', award: '${a.award}' }`).join(', ')
      return `  ${JSON.stringify(name)}: [${serialized}],`
    })
    .join('\n')

  return `// Auto-generated — do not edit by hand. Run scripts/generate-from-scrape.js.

export type AwardType = 'MVP' | 'DPOY' | 'All-NBA-1' | 'All-NBA-2' | 'All-NBA-3'

export interface AwardRecord {
  // Not the app's \`Season\` type — that union only covers the cap-sheet
  // projection window (2026-27 onward); award history reaches into past seasons.
  season: string // 'YYYY-YY', e.g. '2024-25'
  award: AwardType
}

// Name-keyed, matched via lib/player-key.ts's nameLookup() — same lookup
// shape as PLAYER_ROOKIE_YEARS, not a field on Player (award history is a
// lookup table, not part of the per-team roster row).
export const PLAYER_AWARDS: Record<string, AwardRecord[]> = {
${entries}
}
`
}

/**
 * @param {AwardRecord[]} records - already normalized/validated by the
 *   pipeline's normalize stage (matched to a current roster name).
 */
function generateAwards(records, options = {}) {
  const outputPath = path.join(__dirname, '../lib/awards.ts')

  const previousRecords = loadPreviousSnapshot('awards')
  const result = validateAndDiff({ kind: 'awards', records, previousRecords, allowLargeDiff: options.allowLargeDiff })
  if (!result.ok) {
    console.error('Validation failed, refusing to write awards.ts:')
    result.errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }
  result.warnings.forEach((w) => console.warn('  ! ' + w))
  console.log(result.diffSummary)

  const output = buildAwardsTs(records)
  fs.writeFileSync(outputPath, output)
  saveSnapshot('awards', records)
  console.log(`Generated ${records.length} award records to ${outputPath}`)
  return result
}

module.exports = { generateAwards, buildAwardsTs }
