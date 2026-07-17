const fs = require('fs');
const path = require('path');

// Read the CSV file
const csvPath = path.join(__dirname, '../data/player-salaries.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV properly handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse salary string to number
function parseSalary(salaryStr) {
  if (!salaryStr || salaryStr === '') return null;
  // Remove $, commas, and quotes
  const cleaned = salaryStr.replace(/[$,"]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

const lines = csvContent.split('\n').filter(line => line.trim());
const header = parseCSVLine(lines[0]);

console.log('Header columns:', header);

// Look up columns by name instead of a hardcoded position. The header has
// picked up columns over time (e.g. `rookie_year`) that shift every fixed
// index to its right — resolving by name means an inserted/reordered column
// can't silently misalign salary/option data again.
function requireColumn(name) {
  const idx = header.indexOf(name);
  if (idx === -1) throw new Error(`Expected column "${name}" not found in CSV header`);
  return idx;
}

const NAME_COL = requireColumn('Player');
const TEAM_COL = requireColumn('Tm');
// Past seasons (anything before 26-27) are intentionally not carried into the output.
const SEASON_COLUMNS = ['26-27', '27-28', '28-29', '29-30'].map((season) => ({
  season,
  salaryCol: requireColumn(season),
  optionCol: requireColumn(`${season} Option`),
}));

const players = [];

for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);

  const player = fields[NAME_COL];
  const team = fields[TEAM_COL];

  if (!player || !team) continue;

  const salary = {};
  const options = {};
  for (const { season, salaryCol, optionCol } of SEASON_COLUMNS) {
    salary[`20${season}`] = parseSalary(fields[salaryCol]);
    const option = fields[optionCol] || null;
    options[`20${season}`] = option === 'Team' ? 'Team' : option === 'Player' ? 'Player' : null;
  }

  players.push({ name: player, team, salary, options });
}

// Debug specific players
const jabari = players.find(p => p.name.includes('Jabari Smith'));
const amen = players.find(p => p.name.includes('Amen Thompson'));

console.log('\nJabari Smith Jr.:', JSON.stringify(jabari, null, 2));
console.log('\nAmen Thompson:', JSON.stringify(amen, null, 2));

// Generate TypeScript output
let output = `// Auto-generated from CSV data
import type { Season } from './types'

export type OptionType = 'Team' | 'Player' | null

export interface RawPlayerData {
  name: string
  team: string
  salary: Partial<Record<Season, number | null>>
  options: Partial<Record<Season, OptionType>>
}

export const RAW_PLAYER_DATA: RawPlayerData[] = [\n`;

for (const player of players) {
  const salaryEntries = Object.entries(player.salary)
    .filter(([_, v]) => v !== null)
    .map(([k, v]) => `'${k}': ${v}`)
    .join(', ');
  
  const optionEntries = Object.entries(player.options)
    .filter(([_, v]) => v !== null)
    .map(([k, v]) => `'${k}': '${v}'`)
    .join(', ');
  
  output += `  { name: ${JSON.stringify(player.name)}, team: '${player.team}', salary: { ${salaryEntries} }, options: { ${optionEntries} } },\n`;
}

output += `]

// Team name mappings
export const TEAM_NAMES: Record<string, string> = {
  'ATL': 'Atlanta Hawks',
  'BOS': 'Boston Celtics',
  'BRK': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets',
  'CHI': 'Chicago Bulls',
  'CHO': 'Charlotte Hornets',
  'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks',
  'DEN': 'Denver Nuggets',
  'DET': 'Detroit Pistons',
  'GSW': 'Golden State Warriors',
  'HOU': 'Houston Rockets',
  'IND': 'Indiana Pacers',
  'LAC': 'LA Clippers',
  'LAL': 'Los Angeles Lakers',
  'MEM': 'Memphis Grizzlies',
  'MIA': 'Miami Heat',
  'MIL': 'Milwaukee Bucks',
  'MIN': 'Minnesota Timberwolves',
  'NOP': 'New Orleans Pelicans',
  'NYK': 'New York Knicks',
  'OKC': 'Oklahoma City Thunder',
  'ORL': 'Orlando Magic',
  'PHI': 'Philadelphia 76ers',
  'PHO': 'Phoenix Suns',
  'POR': 'Portland Trail Blazers',
  'SAC': 'Sacramento Kings',
  'SAS': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors',
  'UTA': 'Utah Jazz',
  'WAS': 'Washington Wizards',
}

// All team codes
export const ALL_TEAMS = Object.keys(TEAM_NAMES).filter(code => code !== 'CHA').sort()

// Get roster for a specific team
export function getTeamRoster(teamCode: string): RawPlayerData[] {
  return RAW_PLAYER_DATA.filter(p => p.team === teamCode)
}
`;

// Write to file
const outputPath = path.join(__dirname, '../lib/player-data.ts');
fs.writeFileSync(outputPath, output);

console.log(`\nGenerated ${players.length} players to ${outputPath}`);
