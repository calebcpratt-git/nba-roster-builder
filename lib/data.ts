import { Player, Season, CapThreshold } from './types'
import { getTeamRoster as getTeamRosterFromData, ALL_TEAMS, TEAM_NAMES } from './player-data'

// Re-export from player-data
export { ALL_TEAMS, TEAM_NAMES }

// Get players for a specific team (converts PlayerContract to Player format)
export function getTeamRoster(teamAbbreviation: string): Player[] {
  const contracts = getTeamRosterFromData(teamAbbreviation)
  return contracts.map((c, idx) => ({
    id: c.id || `player-${idx}`,
    name: c.name,
    team: c.team,
    salary: c.salary,
    options: c.options,
  }))
}

// Cap thresholds (placeholder values - user will provide real ones)
export const CAP_THRESHOLDS: Record<Season, CapThreshold[]> = {
  '2025-26': [
    { name: 'Salary Cap', value: 145000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 176000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 183500000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 194500000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2026-27': [
    { name: 'Salary Cap', value: 150000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 182000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 189500000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 201000000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2027-28': [
    { name: 'Salary Cap', value: 155000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 188000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 196000000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 207500000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2028-29': [
    { name: 'Salary Cap', value: 160000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 194000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 202000000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 214000000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2029-30': [
    { name: 'Salary Cap', value: 165000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 200000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 208500000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 221000000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2030-31': [
    { name: 'Salary Cap', value: 170000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 206000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 215000000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 228000000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2031-32': [
    { name: 'Salary Cap', value: 175000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 212000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 221500000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 235000000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2032-33': [
    { name: 'Salary Cap', value: 180000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 218000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 228000000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 242000000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2033-34': [
    { name: 'Salary Cap', value: 185000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 224000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 234500000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 249000000, type: 'second-apron', description: 'Severe restrictions apply' },
  ],
  '2034-35': [
    { name: 'Salary Cap', value: 190000000, type: 'soft-cap', description: 'Soft cap - can exceed using exceptions' },
    { name: 'Luxury Tax', value: 230000000, type: 'luxury-tax', description: 'Tax payments begin above this threshold' },
    { name: 'First Apron', value: 241000000, type: 'first-apron', description: 'Restricted from certain transactions' },
    { name: 'Second Apron', value: 256000000, type: 'second-apron', description: 'Severe restrictions apply' },
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
