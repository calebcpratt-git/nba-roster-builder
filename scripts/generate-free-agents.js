const fs = require('fs')
const path = require('path')
const { validateAndDiff } = require('./lib/validate-and-diff')
const { loadPreviousSnapshot, saveSnapshot } = require('./lib/snapshots')

const START_MARKER = '// GENERATED:START'
const END_MARKER = '// GENERATED:END'

// RealGM's faType column is kept raw ('U'/'R') all the way through
// run.py — mapped to the app's readable form only here, at the last step.
const FA_TYPE_LABEL = { U: 'unrestricted', R: 'restricted' }

function tsLiteral(value) {
  if (value === null || value === undefined) return 'undefined'
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * @typedef {{ name: string, priorTeam: string, faType: 'U' | 'R', birdRights?: string }} FreeAgentRecord
 * @param {FreeAgentRecord[]} records
 */
function buildFreeAgentsBlock(records) {
  let block = `${START_MARKER}\nexport const FREE_AGENT_POOL: FreeAgentPoolEntry[] = [\n`
  for (const r of records) {
    const parts = [
      `name: ${tsLiteral(r.name)}`,
      `priorTeam: ${tsLiteral(r.priorTeam)}`,
      `faType: ${tsLiteral(FA_TYPE_LABEL[r.faType] ?? 'unrestricted')}`,
    ]
    if (r.birdRights) parts.push(`birdRights: ${tsLiteral(r.birdRights)}`)
    block += `  { ${parts.join(', ')} },\n`
  }
  block += `]\n${END_MARKER}`
  return block
}

function replaceGeneratedBlock(content, newBlock) {
  const startIdx = content.indexOf(START_MARKER)
  const endIdx = content.indexOf(END_MARKER)
  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + newBlock + content.slice(endIdx + END_MARKER.length)
  }
  const arrayDeclaration = 'export const FREE_AGENT_POOL: FreeAgentPoolEntry[] = ['
  const arrayStart = content.indexOf(arrayDeclaration)
  if (arrayStart === -1) {
    throw new Error('Could not find FREE_AGENT_POOL in lib/free-agents.ts to replace')
  }
  const arrayEndMarker = '\n]\n'
  const arrayEnd = content.indexOf(arrayEndMarker, arrayStart)
  if (arrayEnd === -1) {
    throw new Error('Could not find end of FREE_AGENT_POOL in lib/free-agents.ts')
  }
  const afterArray = arrayEnd + arrayEndMarker.length
  return content.slice(0, arrayStart) + newBlock + '\n' + content.slice(afterArray)
}

/**
 * @param {FreeAgentRecord[]} records
 */
function generateFreeAgents(records, options = {}) {
  const outputPath = path.join(__dirname, '../lib/free-agents.ts')

  const previousRecords = loadPreviousSnapshot('free-agents')
  const result = validateAndDiff({ kind: 'free-agents', records, previousRecords, allowLargeDiff: options.allowLargeDiff })
  if (!result.ok) {
    console.error('Validation failed, refusing to write free-agents.ts:')
    result.errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }
  result.warnings.forEach((w) => console.warn('  ! ' + w))
  console.log(result.diffSummary)

  const currentContent = fs.readFileSync(outputPath, 'utf-8')
  const newBlock = buildFreeAgentsBlock(records)
  const output = replaceGeneratedBlock(currentContent, newBlock)
  fs.writeFileSync(outputPath, output)
  if (!options.skipSnapshotUpdate) saveSnapshot('free-agents', records)
  console.log(`Generated ${records.length} free-agent-pool records to ${outputPath}`)
  return result
}

module.exports = { generateFreeAgents, buildFreeAgentsBlock }
