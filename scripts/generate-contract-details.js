const fs = require('fs')
const path = require('path')
const { validateAndDiff } = require('./lib/validate-and-diff')
const { loadPreviousSnapshot, saveSnapshot } = require('./lib/snapshots')

const START_MARKER = '// GENERATED:START'
const END_MARKER = '// GENERATED:END'

function tsLiteral(value) {
  if (value === null || value === undefined) return 'undefined'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  throw new Error(`Unsupported literal type for contract-detail field: ${typeof value}`)
}

/**
 * @typedef {{ name: string, tradeBonusPct?: number, noTradeClause?: boolean,
 *   signedUnder?: string,
 *   incentives?: Record<string, { likely: number, unlikely: number }> }} ContractDetailRecord
 * @param {ContractDetailRecord[]} records
 */
function buildContractDetailsBlock(records) {
  let block = `${START_MARKER}\nexport const CONTRACT_DETAILS: Record<string, ContractDetail> = {\n`
  for (const r of records) {
    const fields = []
    if (r.tradeBonusPct !== undefined) fields.push(`tradeBonusPct: ${tsLiteral(r.tradeBonusPct)}`)
    if (r.noTradeClause !== undefined) fields.push(`noTradeClause: ${tsLiteral(r.noTradeClause)}`)
    if (r.signedUnder !== undefined) fields.push(`signedUnder: ${tsLiteral(r.signedUnder)}`)
    if (r.incentives !== undefined && Object.keys(r.incentives).length > 0) {
      const seasons = Object.entries(r.incentives)
        .map(([season, v]) => `${JSON.stringify(season)}: { likely: ${moneyOrZero(v.likely)}, unlikely: ${moneyOrZero(v.unlikely)} }`)
        .join(', ')
      fields.push(`incentives: { ${seasons} }`)
    }
    if (fields.length === 0) continue
    block += `  ${JSON.stringify(r.name)}: { ${fields.join(', ')} },\n`
  }
  block += `}\n${END_MARKER}`
  return block
}

function moneyOrZero(v) {
  return typeof v === 'number' ? v : 0
}

function replaceGeneratedBlock(content, newBlock) {
  const startIdx = content.indexOf(START_MARKER)
  const endIdx = content.indexOf(END_MARKER)
  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + newBlock + content.slice(endIdx + END_MARKER.length)
  }
  const arrayDeclaration = 'export const CONTRACT_DETAILS: Record<string, ContractDetail> = {'
  const arrayStart = content.indexOf(arrayDeclaration)
  if (arrayStart === -1) {
    throw new Error('Could not find CONTRACT_DETAILS in lib/contract-details.ts to replace')
  }
  const arrayEndMarker = '\n}\n'
  const arrayEnd = content.indexOf(arrayEndMarker, arrayStart)
  if (arrayEnd === -1) {
    throw new Error('Could not find end of CONTRACT_DETAILS in lib/contract-details.ts')
  }
  const afterArray = arrayEnd + arrayEndMarker.length
  return content.slice(0, arrayStart) + newBlock + '\n' + content.slice(afterArray)
}

function generateContractDetails(records, options = {}) {
  const outputPath = path.join(__dirname, '../lib/contract-details.ts')

  const previousRecords = loadPreviousSnapshot('contract-details')
  const result = validateAndDiff({ kind: 'contract-details', records, previousRecords, allowLargeDiff: options.allowLargeDiff })
  if (!result.ok) {
    console.error('Validation failed, refusing to write contract-details.ts:')
    result.errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }
  result.warnings.forEach((w) => console.warn('  ! ' + w))
  console.log(result.diffSummary)

  const currentContent = fs.readFileSync(outputPath, 'utf-8')
  const newBlock = buildContractDetailsBlock(records)
  const output = replaceGeneratedBlock(currentContent, newBlock)
  fs.writeFileSync(outputPath, output)
  if (!options.skipSnapshotUpdate) saveSnapshot('contract-details', records)
  console.log(`Generated ${records.length} contract-detail records to ${outputPath}`)
  return result
}

module.exports = { generateContractDetails, buildContractDetailsBlock }
