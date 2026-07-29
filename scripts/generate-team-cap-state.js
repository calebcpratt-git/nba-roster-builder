const fs = require('fs')
const path = require('path')
const { validateAndDiff } = require('./lib/validate-and-diff')
const { loadPreviousSnapshot, saveSnapshot } = require('./lib/snapshots')

const START_MARKER = '// GENERATED:START'
const END_MARKER = '// GENERATED:END'

function moneyOrLiteral(v) {
  return v === null || v === undefined ? 'undefined' : String(v)
}

/**
 * @typedef {{ team: string, season: string,
 *   deadMoney: {player: string, amount: number}[],
 *   capHolds: {label: string, amount: number, kind: string}[] }} TeamCapStateRecord
 * @param {TeamCapStateRecord[]} records - flat list, one per (team, season)
 */
function buildTeamCapStateBlock(records) {
  // group flat records into the nested team -> season shape TEAM_CAP_STATE expects
  const byTeam = new Map()
  for (const r of records) {
    if (!byTeam.has(r.team)) byTeam.set(r.team, [])
    byTeam.get(r.team).push(r)
  }
  let block = `${START_MARKER}\nexport const TEAM_CAP_STATE: Record<string, Partial<Record<Season, TeamCapSeason>>> = {\n`
  for (const [team, seasons] of byTeam) {
    block += `  ${team}: {\n`
    for (const r of seasons) {
      const deadMoney = (r.deadMoney ?? [])
        .map((d) => `{ player: ${JSON.stringify(d.player)}, amount: ${moneyOrLiteral(d.amount)} }`)
        .join(', ')
      const capHolds = (r.capHolds ?? [])
        .map((c) => `{ label: ${JSON.stringify(c.label)}, amount: ${moneyOrLiteral(c.amount)}, kind: '${c.kind}' }`)
        .join(', ')
      block += `    '${r.season}': { deadMoney: [${deadMoney}], capHolds: [${capHolds}], heldTPEs: [] },\n`
    }
    block += `  },\n`
  }
  block += `}\n${END_MARKER}`
  return block
}

function replaceGeneratedBlock(content, newBlock) {
  const startIdx = content.indexOf(START_MARKER)
  const endIdx = content.indexOf(END_MARKER)
  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + newBlock + content.slice(endIdx + END_MARKER.length)
  }
  const arrayDeclaration = 'export const TEAM_CAP_STATE: Record<string, Partial<Record<Season, TeamCapSeason>>> = {'
  const arrayStart = content.indexOf(arrayDeclaration)
  if (arrayStart === -1) {
    throw new Error('Could not find TEAM_CAP_STATE in lib/team-cap-state.ts to replace')
  }
  const arrayEndMarker = '\n}\n'
  const arrayEnd = content.indexOf(arrayEndMarker, arrayStart)
  if (arrayEnd === -1) {
    throw new Error('Could not find end of TEAM_CAP_STATE in lib/team-cap-state.ts')
  }
  const afterArray = arrayEnd + arrayEndMarker.length
  return content.slice(0, arrayStart) + newBlock + '\n' + content.slice(afterArray)
}

function byTeamCount(records) {
  return new Set(records.map((r) => r.team)).size
}

function generateTeamCapState(records, options = {}) {
  const outputPath = path.join(__dirname, '../lib/team-cap-state.ts')

  const previousRecords = loadPreviousSnapshot('team-cap-state')
  const result = validateAndDiff({ kind: 'team-cap-state', records, previousRecords, allowLargeDiff: options.allowLargeDiff })
  if (!result.ok) {
    console.error('Validation failed, refusing to write team-cap-state.ts:')
    result.errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }
  result.warnings.forEach((w) => console.warn('  ! ' + w))
  console.log(result.diffSummary)

  const currentContent = fs.readFileSync(outputPath, 'utf-8')
  const newBlock = buildTeamCapStateBlock(records)
  const output = replaceGeneratedBlock(currentContent, newBlock)
  fs.writeFileSync(outputPath, output)
  saveSnapshot('team-cap-state', records)
  console.log(`Generated cap state for ${byTeamCount(records)} teams to ${outputPath}`)
}

module.exports = { generateTeamCapState, buildTeamCapStateBlock }
