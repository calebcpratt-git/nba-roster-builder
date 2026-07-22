const fs = require('fs')
const path = require('path')
const { validateAndDiff } = require('./lib/validate-and-diff')
const { loadPreviousSnapshot, saveSnapshot } = require('./lib/snapshots')

const START_MARKER = '// GENERATED:START'
const END_MARKER = '// GENERATED:END'

const FIELDS = [
  'teamOwner',
  'year',
  'round',
  'teamFrom',
  'swapOwner',
  'swapOption',
  'protections',
  'pickNumber',
  'pickPool',
  'rank',
]

function tsLiteral(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  throw new Error(`Unsupported literal type for draft pick field: ${typeof value}`)
}

/**
 * @typedef {{
 *   teamOwner: string, year: number, round: 'First Round' | 'Second Round',
 *   teamFrom: string | null, swapOwner: string | null, swapOption: string | null,
 *   protections: string | null, pickNumber: number | null,
 *   pickPool: string | null, rank: string | null
 * }} DraftPickRecord
 * @param {DraftPickRecord[]} picks
 * @returns {string} the GENERATED:START..GENERATED:END block, including markers
 */
function buildDraftPicksBlock(picks) {
  let block = `${START_MARKER}\nexport const DRAFT_PICKS: DraftPick[] = [\n`
  for (const pick of picks) {
    const parts = FIELDS.map((field) => `${field}: ${tsLiteral(pick[field])}`)
    block += `  { ${parts.join(', ')} },\n`
  }
  block += `]\n${END_MARKER}`
  return block
}

/**
 * Replaces only the generated DRAFT_PICKS array in the existing file content,
 * leaving parseProtection, parseSwap, enrichPick, and the getPicksBy/getDraftPickPlayers
 * exports untouched.
 * Falls back to locating the raw (unmarked) array on the first run after
 * this generator is introduced, then wraps it in markers going forward.
 */
function replaceGeneratedBlock(content, newBlock) {
  const startIdx = content.indexOf(START_MARKER)
  const endIdx = content.indexOf(END_MARKER)
  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + newBlock + content.slice(endIdx + END_MARKER.length)
  }

  const arrayDeclaration = 'export const DRAFT_PICKS: DraftPick[] = ['
  const arrayStart = content.indexOf(arrayDeclaration)
  if (arrayStart === -1) {
    throw new Error('Could not find DRAFT_PICKS array in lib/draft-picks.ts to replace')
  }
  const arrayEndMarker = '\n]\n'
  const arrayEnd = content.indexOf(arrayEndMarker, arrayStart)
  if (arrayEnd === -1) {
    throw new Error('Could not find end of DRAFT_PICKS array in lib/draft-picks.ts')
  }
  const afterArray = arrayEnd + arrayEndMarker.length
  return content.slice(0, arrayStart) + newBlock + '\n' + content.slice(afterArray)
}

/**
 * @param {DraftPickRecord[]} picks
 */
function generateDraftPicks(picks, options = {}) {
  const outputPath = path.join(__dirname, '../lib/draft-picks.ts')

  const previousRecords = loadPreviousSnapshot('draft-picks')

  const result = validateAndDiff({ kind: 'draft-picks', records: picks, previousRecords, allowLargeDiff: options.allowLargeDiff })
  if (!result.ok) {
    console.error('Validation failed, refusing to write draft-picks.ts:')
    result.errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }
  result.warnings.forEach((w) => console.warn('  ! ' + w))
  console.log(result.diffSummary)

  const currentContent = fs.readFileSync(outputPath, 'utf-8')
  const newBlock = buildDraftPicksBlock(picks)
  const output = replaceGeneratedBlock(currentContent, newBlock)
  fs.writeFileSync(outputPath, output)
  saveSnapshot('draft-picks', picks)
  console.log(`Generated ${picks.length} draft picks to ${outputPath}`)
}

module.exports = { generateDraftPicks, buildDraftPicksBlock }
