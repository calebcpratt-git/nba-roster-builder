const fs = require('fs')
const path = require('path')
const { validateAndDiff } = require('./lib/validate-and-diff')
const { loadPreviousSnapshot, saveSnapshot } = require('./lib/snapshots')

// Team name mappings — kept alongside the generator since they're stable
// app-level metadata, not something the scraper produces per-player.
const TEAM_NAMES = {
  ATL: 'Atlanta Hawks',
  BOS: 'Boston Celtics',
  BRK: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls',
  CHO: 'Charlotte Hornets',
  CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks',
  DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors',
  HOU: 'Houston Rockets',
  IND: 'Indiana Pacers',
  LAC: 'LA Clippers',
  LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks',
  MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans',
  NYK: 'New York Knicks',
  OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers',
  PHO: 'Phoenix Suns',
  POR: 'Portland Trail Blazers',
  SAC: 'Sacramento Kings',
  SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors',
  UTA: 'Utah Jazz',
  WAS: 'Washington Wizards',
}

/**
 * @typedef {{
 *   name: string, team: string,
 *   salary: Record<string, number|null>,
 *   options: Record<string, 'Team'|'Player'|null>,
 *   guarantees?: Record<string, { status: 'full'|'partial'|'non-guaranteed', amount?: number, guaranteeDate?: string }>
 * }} PlayerRecord
 * @param {PlayerRecord[]} players
 * @returns {string}
 */
function buildPlayerDataTs(players) {
  let output = `// Auto-generated — do not edit by hand. Run scripts/generate-player-data.js.
import type { Season, SeasonGuarantee } from './types'

export type OptionType = 'Team' | 'Player' | null

export interface RawPlayerData {
  name: string
  team: string
  salary: Partial<Record<Season, number | null>>
  options: Partial<Record<Season, OptionType>>
  guarantees?: Partial<Record<Season, SeasonGuarantee>>
}

export const RAW_PLAYER_DATA: RawPlayerData[] = [\n`

  for (const player of players) {
    const salaryEntries = Object.entries(player.salary ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `'${k}': ${v}`)
      .join(', ')

    const optionEntries = Object.entries(player.options ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `'${k}': '${v}'`)
      .join(', ')

    let guaranteesField = ''
    const guaranteeEntries = Object.entries(player.guarantees ?? {}).filter(([, v]) => v != null)
    if (guaranteeEntries.length > 0) {
      const serialized = guaranteeEntries
        .map(([season, g]) => {
          const fields = [`status: '${g.status}'`]
          if (g.amount !== undefined) fields.push(`amount: ${g.amount}`)
          if (g.guaranteeDate !== undefined) fields.push(`guaranteeDate: '${g.guaranteeDate}'`)
          return `'${season}': { ${fields.join(', ')} }`
        })
        .join(', ')
      guaranteesField = `, guarantees: { ${serialized} }`
    }

    output += `  { name: ${JSON.stringify(player.name)}, team: '${player.team}', salary: { ${salaryEntries} }, options: { ${optionEntries} }${guaranteesField} },\n`
  }

  const teamNamesEntries = Object.entries(TEAM_NAMES)
    .map(([abbr, name]) => `  '${abbr}': '${name}',`)
    .join('\n')

  output += `]

// Team name mappings
export const TEAM_NAMES: Record<string, string> = {
${teamNamesEntries}
}

// All team codes
export const ALL_TEAMS = Object.keys(TEAM_NAMES).filter(code => code !== 'CHA').sort()

// Get roster for a specific team
export function getTeamRoster(teamCode: string): RawPlayerData[] {
  return RAW_PLAYER_DATA.filter(p => p.team === teamCode)
}
`

  return output
}

/**
 * @param {PlayerRecord[]} players - already normalized/validated by the pipeline's
 *   own normalize stage (canonical IDs resolved, team codes mapped to app
 *   abbreviations). This function does NOT scrape or parse CSV — it only
 *   emits the TS file and enforces the safety checks in validate-and-diff.js.
 */
function generatePlayerData(players, options = {}) {
  const outputPath = path.join(__dirname, '../lib/player-data.ts')

  const previousRecords = loadPreviousSnapshot('players')

  const result = validateAndDiff({ kind: 'players', records: players, previousRecords, allowLargeDiff: options.allowLargeDiff })
  if (!result.ok) {
    console.error('Validation failed, refusing to write player-data.ts:')
    result.errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }
  result.warnings.forEach((w) => console.warn('  ! ' + w))
  console.log(result.diffSummary)

  const output = buildPlayerDataTs(players)
  fs.writeFileSync(outputPath, output)
  saveSnapshot('players', players)
  console.log(`Generated ${players.length} players to ${outputPath}`)
}

module.exports = { generatePlayerData, buildPlayerDataTs }
