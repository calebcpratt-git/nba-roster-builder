import { Player, Season, CapThreshold, CapStatus } from './types'
import { getTeamRoster as getTeamRosterFromData, ALL_TEAMS, TEAM_NAMES } from './player-data'

// Re-export from player-data
export { ALL_TEAMS, TEAM_NAMES }

// Get players for a specific team (converts PlayerContract to Player format)
function dropNulls<T extends string, V>(record: Partial<Record<T, V | null>>): Partial<Record<T, V>> {
  const result: Partial<Record<T, V>> = {}
  for (const [key, value] of Object.entries(record) as [T, V | null][]) {
    if (value != null) result[key] = value
  }
  return result
}

export function getTeamRoster(teamAbbreviation: string): Player[] {
  const contracts = getTeamRosterFromData(teamAbbreviation)
  return contracts.map((c, idx) => ({
    id: `player-${idx}`,
    name: c.name,
    team: c.team,
    salary: dropNulls(c.salary),
    options: dropNulls(c.options),
    guarantees: c.guarantees,
  }))
}

// Cap thresholds (placeholder values - user will provide real ones)
export const CAP_THRESHOLDS: Record<Season, CapThreshold[]> = {
  '2026-27': [
    { name: 'Salary Cap', value: 164961000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 148465000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 200428000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 209015000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 221686000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2027-28': [
    { name: 'Salary Cap', value: 174034000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 156631000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 211452000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 220511000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 233879000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2028-29': [
    { name: 'Salary Cap', value: 183606000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 165246000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 223082000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 232639000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 246742000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2029-30': [
    { name: 'Salary Cap', value: 193704000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 174335000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 235352000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 245434000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 260313000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2030-31': [
    { name: 'Salary Cap', value: 204358000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 183923000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 248296000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 258933000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 274630000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2031-32': [
    { name: 'Salary Cap', value: 215598000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 194039000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 261952000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 273174000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 289735000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2032-33': [
    { name: 'Salary Cap', value: 227456000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 204711000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 276359000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 288199000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 305670000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2033-34': [
    { name: 'Salary Cap', value: 239966000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 215970000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 291559000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 304050000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 322482000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2034-35': [
    { name: 'Salary Cap', value: 253164000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Salary Floor', value: 227848000, type: 'salary-floor', description: 'Minimum team payroll required' },
    { name: 'Luxury Tax', value: 307595000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 320773000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 340219000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
}

// Team info for display
export const TEAMS: Record<string, { name: string; city: string; primaryColor: string; secondaryColor: string }> = {
  ATL: { name: 'Hawks', city: 'Atlanta', primaryColor: '#E03A3E', secondaryColor: '#C1D32F' },
  BOS: { name: 'Celtics', city: 'Boston', primaryColor: '#007A33', secondaryColor: '#BA9653' },
  BRK: { name: 'Nets', city: 'Brooklyn', primaryColor: '#000000', secondaryColor: '#FFFFFF' },
  CHO: { name: 'Hornets', city: 'Charlotte', primaryColor: '#1D1160', secondaryColor: '#00788C' },
  CHI: { name: 'Bulls', city: 'Chicago', primaryColor: '#CE1141', secondaryColor: '#000000' },
  CLE: { name: 'Cavaliers', city: 'Cleveland', primaryColor: '#860038', secondaryColor: '#FDBB30' },
  DAL: { name: 'Mavericks', city: 'Dallas', primaryColor: '#00538C', secondaryColor: '#002B5E' },
  DEN: { name: 'Nuggets', city: 'Denver', primaryColor: '#0E2240', secondaryColor: '#FEC524' },
  DET: { name: 'Pistons', city: 'Detroit', primaryColor: '#C8102E', secondaryColor: '#1D42BA' },
  GSW: { name: 'Warriors', city: 'Golden State', primaryColor: '#1D428A', secondaryColor: '#FFC72C' },
  HOU: { name: 'Rockets', city: 'Houston', primaryColor: '#CE1141', secondaryColor: '#000000' },
  IND: { name: 'Pacers', city: 'Indiana', primaryColor: '#002D62', secondaryColor: '#FDBB30' },
  LAC: { name: 'Clippers', city: 'Los Angeles', primaryColor: '#C8102E', secondaryColor: '#1D428A' },
  LAL: { name: 'Lakers', city: 'Los Angeles', primaryColor: '#552583', secondaryColor: '#FDB927' },
  MEM: { name: 'Grizzlies', city: 'Memphis', primaryColor: '#5D76A9', secondaryColor: '#12173F' },
  MIA: { name: 'Heat', city: 'Miami', primaryColor: '#98002E', secondaryColor: '#F9A01B' },
  MIL: { name: 'Bucks', city: 'Milwaukee', primaryColor: '#00471B', secondaryColor: '#EEE1C6' },
  MIN: { name: 'Timberwolves', city: 'Minnesota', primaryColor: '#0C2340', secondaryColor: '#236192' },
  NOP: { name: 'Pelicans', city: 'New Orleans', primaryColor: '#0C2340', secondaryColor: '#C8102E' },
  NYK: { name: 'Knicks', city: 'New York', primaryColor: '#006BB6', secondaryColor: '#F58426' },
  OKC: { name: 'Thunder', city: 'Oklahoma City', primaryColor: '#007AC1', secondaryColor: '#EF3B24' },
  ORL: { name: 'Magic', city: 'Orlando', primaryColor: '#0077C0', secondaryColor: '#C4CED4' },
  PHI: { name: '76ers', city: 'Philadelphia', primaryColor: '#006BB6', secondaryColor: '#ED174C' },
  PHO: { name: 'Suns', city: 'Phoenix', primaryColor: '#1D1160', secondaryColor: '#E56020' },
  POR: { name: 'Trail Blazers', city: 'Portland', primaryColor: '#E03A3E', secondaryColor: '#000000' },
  SAC: { name: 'Kings', city: 'Sacramento', primaryColor: '#5A2D81', secondaryColor: '#63727A' },
  SAS: { name: 'Spurs', city: 'San Antonio', primaryColor: '#C4CED4', secondaryColor: '#000000' },
  TOR: { name: 'Raptors', city: 'Toronto', primaryColor: '#CE1141', secondaryColor: '#000000' },
  UTA: { name: 'Jazz', city: 'Utah', primaryColor: '#002B5C', secondaryColor: '#00471B' },
  WAS: { name: 'Wizards', city: 'Washington', primaryColor: '#002B5C', secondaryColor: '#E31837' },
}

export function getCapStatus(total: number, thresholds: { type: string; value: number }[]): CapStatus {
  const secondApron = thresholds.find((t) => t.type === 'second-apron')?.value || 0
  const firstApron = thresholds.find((t) => t.type === 'first-apron')?.value || 0
  const luxuryTax = thresholds.find((t) => t.type === 'luxury-tax')?.value || 0
  const softCap = thresholds.find((t) => t.type === 'soft-cap')?.value || 0

  if (total >= secondApron) return '2nd Apron'
  if (total >= firstApron) return '1st Apron'
  if (total >= luxuryTax) return 'Luxury Tax'
  if (total >= softCap) return 'Over Cap'
  return 'Below Cap'
}

export function getCapStatusColor(status: CapStatus): string {
  switch (status) {
    case '2nd Apron':
      return 'text-red-500 bg-red-500/10'
    case '1st Apron':
      return 'text-orange-500 bg-orange-500/10'
    case 'Luxury Tax':
      return 'text-amber-500 bg-amber-500/10'
    case 'Over Cap':
      return 'text-yellow-500 bg-yellow-500/10'
    case 'Below Cap':
      return 'text-emerald-500 bg-emerald-500/10'
  }
}

export function getTotalSalaryColor(status: CapStatus): string {
  switch (status) {
    case '2nd Apron':
      return 'text-red-500'
    case '1st Apron':
      return 'text-orange-500'
    case 'Luxury Tax':
      return 'text-amber-500'
    case 'Over Cap':
      return 'text-yellow-500'
    case 'Below Cap':
      return 'text-emerald-500'
  }
}

export function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}
