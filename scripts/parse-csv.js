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

console.log('Header columns:', header.slice(0, 12));

const players = [];

for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);
  
  const player = fields[0];
  const team = fields[1];
  
  // Columns: 0=Player, 1=Tm, 2=25-26, 3=25-26 Option, 4=26-27, 5=26-27 Option,
  //          6=27-28, 7=27-28 Option, 8=28-29, 9=28-29 Option, 10=29-30, 11=29-30 Option
  // 25-26 is a past season and is intentionally not carried into the output.
  const salary2627 = parseSalary(fields[4]);
  const option2627 = fields[5] || null;
  const salary2728 = parseSalary(fields[6]);
  const option2728 = fields[7] || null;
  const salary2829 = parseSalary(fields[8]);
  const option2829 = fields[9] || null;
  const salary2930 = parseSalary(fields[10]);
  const option2930 = fields[11] || null;
  
  if (!player || !team) continue;
  
  players.push({
    name: player,
    team,
    salary: {
      '2026-27': salary2627,
      '2027-28': salary2728,
      '2028-29': salary2829,
      '2029-30': salary2930,
    },
    options: {
      '2026-27': option2627 === 'Team' ? 'Team' : option2627 === 'Player' ? 'Player' : null,
      '2027-28': option2728 === 'Team' ? 'Team' : option2728 === 'Player' ? 'Player' : null,
      '2028-29': option2829 === 'Team' ? 'Team' : option2829 === 'Player' ? 'Player' : null,
      '2029-30': option2930 === 'Team' ? 'Team' : option2930 === 'Player' ? 'Player' : null,
    }
  });
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
  'BKN': 'Brooklyn Nets',
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

// Get all unique team codes
export function getAllTeams(): string[] {
  const teams = new Set<string>()
  for (const player of RAW_PLAYER_DATA) {
    teams.add(player.team)
  }
  return Array.from(teams).sort()
}

// Get roster for a specific team
export function getTeamRoster(teamCode: string): RawPlayerData[] {
  return RAW_PLAYER_DATA.filter(p => p.team === teamCode)
}
`;

// Write to file
const outputPath = path.join(__dirname, '../lib/player-data.ts');
fs.writeFileSync(outputPath, output);

console.log(`\nGenerated ${players.length} players to ${outputPath}`);
