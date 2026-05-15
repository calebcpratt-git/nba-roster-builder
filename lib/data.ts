import { Team, Player, CapThreshold, Season, SEASONS } from './types'

// Sample NBA Teams
export const TEAMS: Team[] = [
  { id: 'bos', name: 'Celtics', abbreviation: 'BOS', city: 'Boston', conference: 'Eastern', division: 'Atlantic', primaryColor: '#007A33', secondaryColor: '#BA9653' },
  { id: 'bkn', name: 'Nets', abbreviation: 'BKN', city: 'Brooklyn', conference: 'Eastern', division: 'Atlantic', primaryColor: '#000000', secondaryColor: '#FFFFFF' },
  { id: 'nyk', name: 'Knicks', abbreviation: 'NYK', city: 'New York', conference: 'Eastern', division: 'Atlantic', primaryColor: '#F58426', secondaryColor: '#006BB6' },
  { id: 'phi', name: '76ers', abbreviation: 'PHI', city: 'Philadelphia', conference: 'Eastern', division: 'Atlantic', primaryColor: '#006BB6', secondaryColor: '#ED174C' },
  { id: 'tor', name: 'Raptors', abbreviation: 'TOR', city: 'Toronto', conference: 'Eastern', division: 'Atlantic', primaryColor: '#CE1141', secondaryColor: '#000000' },
  { id: 'chi', name: 'Bulls', abbreviation: 'CHI', city: 'Chicago', conference: 'Eastern', division: 'Central', primaryColor: '#CE1141', secondaryColor: '#000000' },
  { id: 'cle', name: 'Cavaliers', abbreviation: 'CLE', city: 'Cleveland', conference: 'Eastern', division: 'Central', primaryColor: '#6F263D', secondaryColor: '#FFB81C' },
  { id: 'det', name: 'Pistons', abbreviation: 'DET', city: 'Detroit', conference: 'Eastern', division: 'Central', primaryColor: '#C8102E', secondaryColor: '#1D42BA' },
  { id: 'ind', name: 'Pacers', abbreviation: 'IND', city: 'Indiana', conference: 'Eastern', division: 'Central', primaryColor: '#002D62', secondaryColor: '#FDBB30' },
  { id: 'mil', name: 'Bucks', abbreviation: 'MIL', city: 'Milwaukee', conference: 'Eastern', division: 'Central', primaryColor: '#00471B', secondaryColor: '#EEE1C6' },
  { id: 'atl', name: 'Hawks', abbreviation: 'ATL', city: 'Atlanta', conference: 'Eastern', division: 'Southeast', primaryColor: '#E03A3E', secondaryColor: '#C1D32F' },
  { id: 'cha', name: 'Hornets', abbreviation: 'CHA', city: 'Charlotte', conference: 'Eastern', division: 'Southeast', primaryColor: '#1D1160', secondaryColor: '#00788C' },
  { id: 'mia', name: 'Heat', abbreviation: 'MIA', city: 'Miami', conference: 'Eastern', division: 'Southeast', primaryColor: '#98002E', secondaryColor: '#F9A01B' },
  { id: 'orl', name: 'Magic', abbreviation: 'ORL', city: 'Orlando', conference: 'Eastern', division: 'Southeast', primaryColor: '#0077C0', secondaryColor: '#C4CED4' },
  { id: 'was', name: 'Wizards', abbreviation: 'WAS', city: 'Washington', conference: 'Eastern', division: 'Southeast', primaryColor: '#002B5C', secondaryColor: '#E31837' },
  { id: 'den', name: 'Nuggets', abbreviation: 'DEN', city: 'Denver', conference: 'Western', division: 'Northwest', primaryColor: '#0E2240', secondaryColor: '#FEC524' },
  { id: 'min', name: 'Timberwolves', abbreviation: 'MIN', city: 'Minnesota', conference: 'Western', division: 'Northwest', primaryColor: '#0C2340', secondaryColor: '#236192' },
  { id: 'okc', name: 'Thunder', abbreviation: 'OKC', city: 'Oklahoma City', conference: 'Western', division: 'Northwest', primaryColor: '#007AC1', secondaryColor: '#EF3B24' },
  { id: 'por', name: 'Trail Blazers', abbreviation: 'POR', city: 'Portland', conference: 'Western', division: 'Northwest', primaryColor: '#E03A3E', secondaryColor: '#000000' },
  { id: 'uta', name: 'Jazz', abbreviation: 'UTA', city: 'Utah', conference: 'Western', division: 'Northwest', primaryColor: '#002B5C', secondaryColor: '#00471B' },
  { id: 'gsw', name: 'Warriors', abbreviation: 'GSW', city: 'Golden State', conference: 'Western', division: 'Pacific', primaryColor: '#1D428A', secondaryColor: '#FFC72C' },
  { id: 'lac', name: 'Clippers', abbreviation: 'LAC', city: 'Los Angeles', conference: 'Western', division: 'Pacific', primaryColor: '#C8102E', secondaryColor: '#1D428A' },
  { id: 'lal', name: 'Lakers', abbreviation: 'LAL', city: 'Los Angeles', conference: 'Western', division: 'Pacific', primaryColor: '#552583', secondaryColor: '#FDB927' },
  { id: 'phx', name: 'Suns', abbreviation: 'PHX', city: 'Phoenix', conference: 'Western', division: 'Pacific', primaryColor: '#1D1160', secondaryColor: '#E56020' },
  { id: 'sac', name: 'Kings', abbreviation: 'SAC', city: 'Sacramento', conference: 'Western', division: 'Pacific', primaryColor: '#5A2D81', secondaryColor: '#63727A' },
  { id: 'dal', name: 'Mavericks', abbreviation: 'DAL', city: 'Dallas', conference: 'Western', division: 'Southwest', primaryColor: '#00538C', secondaryColor: '#002B5E' },
  { id: 'hou', name: 'Rockets', abbreviation: 'HOU', city: 'Houston', conference: 'Western', division: 'Southwest', primaryColor: '#CE1141', secondaryColor: '#000000' },
  { id: 'mem', name: 'Grizzlies', abbreviation: 'MEM', city: 'Memphis', conference: 'Western', division: 'Southwest', primaryColor: '#5D76A9', secondaryColor: '#12173F' },
  { id: 'nop', name: 'Pelicans', abbreviation: 'NOP', city: 'New Orleans', conference: 'Western', division: 'Southwest', primaryColor: '#0C2340', secondaryColor: '#C8102E' },
  { id: 'sas', name: 'Spurs', abbreviation: 'SAS', city: 'San Antonio', conference: 'Western', division: 'Southwest', primaryColor: '#C4CED4', secondaryColor: '#000000' },
]

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
}

// Sample roster for Boston Celtics (placeholder data - user will provide real data)
export const SAMPLE_ROSTER: Player[] = [
  {
    id: '1',
    name: 'Jayson Tatum',
    position: 'SF',
    jerseyNumber: 0,
    salary: {
      '2025-26': 37096500,
      '2026-27': 54000000,
      '2027-28': 58000000,
      '2028-29': 62000000,
      '2029-30': 66000000,
    },
    contractType: 'guaranteed',
  },
  {
    id: '2',
    name: 'Jaylen Brown',
    position: 'SG',
    jerseyNumber: 7,
    salary: {
      '2025-26': 53350000,
      '2026-27': 57350000,
      '2027-28': 61350000,
      '2028-29': 65350000,
    },
    contractType: 'guaranteed',
    playerOption: '2028-29',
  },
  {
    id: '3',
    name: 'Derrick White',
    position: 'PG',
    jerseyNumber: 9,
    salary: {
      '2025-26': 21700000,
      '2026-27': 23300000,
      '2027-28': 24900000,
    },
    contractType: 'guaranteed',
  },
  {
    id: '4',
    name: 'Kristaps Porzingis',
    position: 'C',
    jerseyNumber: 8,
    salary: {
      '2025-26': 30600000,
    },
    contractType: 'guaranteed',
    playerOption: '2025-26',
  },
  {
    id: '5',
    name: 'Jrue Holiday',
    position: 'PG',
    jerseyNumber: 4,
    salary: {
      '2025-26': 39500000,
      '2026-27': 42500000,
    },
    contractType: 'guaranteed',
  },
  {
    id: '6',
    name: 'Al Horford',
    position: 'C',
    jerseyNumber: 42,
    salary: {
      '2025-26': 10000000,
    },
    contractType: 'partially-guaranteed',
    teamOption: '2025-26',
  },
  {
    id: '7',
    name: 'Payton Pritchard',
    position: 'PG',
    jerseyNumber: 11,
    salary: {
      '2025-26': 7200000,
      '2026-27': 7700000,
      '2027-28': 8200000,
    },
    contractType: 'guaranteed',
  },
  {
    id: '8',
    name: 'Sam Hauser',
    position: 'SF',
    jerseyNumber: 30,
    salary: {
      '2025-26': 3200000,
      '2026-27': 3400000,
      '2027-28': 3600000,
    },
    contractType: 'guaranteed',
  },
]

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
