const fs = require('fs')
const path = require('path')
const { validateAndDiff } = require('./lib/validate-and-diff')
const { loadPreviousSnapshot, saveSnapshot } = require('./lib/snapshots')

const START_MARKER = '// GENERATED:START'
const END_MARKER = '// GENERATED:END'

function moneyOrLiteral(v) {
  return v === null || v === undefined ? 'undefined' : String(v)
}

function buildExceptionPool(pool) {
  const signings = (pool.signings ?? [])
    .map((s) => {
      const date = s.date ? `, date: ${JSON.stringify(s.date)}` : ''
      return `{ player: ${JSON.stringify(s.player)}, amount: ${moneyOrLiteral(s.amount)}${date} }`
    })
    .join(', ')
  const remaining = pool.remaining != null ? `, remaining: ${moneyOrLiteral(pool.remaining)}` : ''
  return `{ signings: [${signings}]${remaining} }`
}

function buildExceptionsUsed(exceptionsUsed) {
  if (!exceptionsUsed) return ''
  const parts = []
  for (const key of ['nonTaxpayerMLE', 'taxpayerMLE', 'roomMLE', 'biAnnual']) {
    const pool = exceptionsUsed[key]
    if (pool) parts.push(`${key}: ${buildExceptionPool(pool)}`)
  }
  if (exceptionsUsed.dpe) {
    const d = exceptionsUsed.dpe
    const remaining = d.remaining != null ? `, remaining: ${moneyOrLiteral(d.remaining)}` : ''
    parts.push(`dpe: { player: ${JSON.stringify(d.player)}, initial: ${moneyOrLiteral(d.initial)}, used: ${!!d.used}${remaining} }`)
  }
  if (exceptionsUsed.tradeExceptionsUsed?.length) {
    const entries = exceptionsUsed.tradeExceptionsUsed
      .map((u) => `{ tpeFromPlayer: ${JSON.stringify(u.tpeFromPlayer)}, usedByPlayer: ${JSON.stringify(u.usedByPlayer)}, amount: ${moneyOrLiteral(u.amount)}, date: ${JSON.stringify(u.date)} }`)
      .join(', ')
    parts.push(`tradeExceptionsUsed: [${entries}]`)
  }
  if (!parts.length) return ''
  return `, exceptionsUsed: { ${parts.join(', ')} }`
}

/**
 * @typedef {{ team: string, season: string,
 *   deadMoney: {player: string, amount: number}[],
 *   capHolds: {label: string, amount: number, kind: string, birdRights?: string}[],
 *   heldTPEs?: {id: string, amount: number, expires: string, fromPlayer?: string}[],
 *   apronAddon?: number,
 *   hardCapped?: {apron: 1 | 2, trigger?: string},
 *   cashLedger?: {availableToSend: number, availableToReceive: number} }} TeamCapStateRecord
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
        .map((c) => {
          const birdRights = c.birdRights ? `, birdRights: '${c.birdRights}'` : ''
          return `{ label: ${JSON.stringify(c.label)}, amount: ${moneyOrLiteral(c.amount)}, kind: '${c.kind}'${birdRights} }`
        })
        .join(', ')
      const heldTPEs = (r.heldTPEs ?? [])
        .map((t) => {
          const fromPlayer = t.fromPlayer ? `, fromPlayer: ${JSON.stringify(t.fromPlayer)}` : ''
          return `{ id: ${JSON.stringify(t.id)}, amount: ${moneyOrLiteral(t.amount)}, expires: ${JSON.stringify(t.expires)}${fromPlayer} }`
        })
        .join(', ')
      const apronAddon = r.apronAddon != null ? `, apronAddon: ${moneyOrLiteral(r.apronAddon)}` : ''
      const hardCapped = r.hardCapped
        ? `, hardCapped: { apron: ${r.hardCapped.apron}${r.hardCapped.trigger ? `, trigger: ${JSON.stringify(r.hardCapped.trigger)}` : ''} }`
        : ''
      const cashLedger = r.cashLedger
        ? `, cashLedger: { availableToSend: ${moneyOrLiteral(r.cashLedger.availableToSend)}, availableToReceive: ${moneyOrLiteral(r.cashLedger.availableToReceive)} }`
        : ''
      const exceptionsUsed = buildExceptionsUsed(r.exceptionsUsed)
      block += `    '${r.season}': { deadMoney: [${deadMoney}], capHolds: [${capHolds}], heldTPEs: [${heldTPEs}]${apronAddon}${hardCapped}${cashLedger}${exceptionsUsed} },\n`
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
  if (!options.skipSnapshotUpdate) saveSnapshot('team-cap-state', records)
  console.log(`Generated cap state for ${byTeamCount(records)} teams to ${outputPath}`)
  return result
}

module.exports = { generateTeamCapState, buildTeamCapStateBlock }
