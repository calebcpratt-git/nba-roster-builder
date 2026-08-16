// Auto-generated — do not edit by hand. Run scripts/generate-from-scrape.js.

export type AwardType = 'MVP' | 'DPOY' | 'All-NBA-1' | 'All-NBA-2' | 'All-NBA-3'

export interface AwardRecord {
  // Not the app's `Season` type — that union only covers the cap-sheet
  // projection window (2026-27 onward); award history reaches into past seasons.
  season: string // 'YYYY-YY', e.g. '2024-25'
  award: AwardType
}

// Name-keyed, matched via lib/player-key.ts's nameLookup() — same lookup
// shape as PLAYER_ROOKIE_YEARS, not a field on Player (award history is a
// lookup table, not part of the per-team roster row).
export const PLAYER_AWARDS: Record<string, AwardRecord[]> = {
  "Shai Gilgeous-Alexander": [{ season: '2022-23', award: 'All-NBA-1' }, { season: '2023-24', award: 'All-NBA-1' }, { season: '2024-25', award: 'MVP' }, { season: '2024-25', award: 'All-NBA-1' }, { season: '2025-26', award: 'MVP' }, { season: '2025-26', award: 'All-NBA-1' }],
  "Nikola Jokić": [{ season: '2021-22', award: 'MVP' }, { season: '2021-22', award: 'All-NBA-1' }, { season: '2022-23', award: 'All-NBA-2' }, { season: '2023-24', award: 'MVP' }, { season: '2023-24', award: 'All-NBA-1' }, { season: '2024-25', award: 'All-NBA-1' }, { season: '2025-26', award: 'All-NBA-1' }],
  "Victor Wembanyama": [{ season: '2025-26', award: 'All-NBA-1' }],
  "Luka Dončić": [{ season: '2021-22', award: 'All-NBA-1' }, { season: '2022-23', award: 'All-NBA-1' }, { season: '2023-24', award: 'All-NBA-1' }, { season: '2025-26', award: 'All-NBA-1' }],
  "Cade Cunningham": [{ season: '2024-25', award: 'All-NBA-3' }, { season: '2025-26', award: 'All-NBA-1' }],
  "Jaylen Brown": [{ season: '2022-23', award: 'All-NBA-2' }, { season: '2025-26', award: 'All-NBA-2' }],
  "Kawhi Leonard": [{ season: '2023-24', award: 'All-NBA-2' }, { season: '2025-26', award: 'All-NBA-2' }],
  "Donovan Mitchell": [{ season: '2022-23', award: 'All-NBA-2' }, { season: '2024-25', award: 'All-NBA-1' }, { season: '2025-26', award: 'All-NBA-2' }],
  "Kevin Durant": [{ season: '2021-22', award: 'All-NBA-2' }, { season: '2023-24', award: 'All-NBA-2' }, { season: '2025-26', award: 'All-NBA-2' }],
  "Jalen Brunson": [{ season: '2023-24', award: 'All-NBA-2' }, { season: '2024-25', award: 'All-NBA-2' }, { season: '2025-26', award: 'All-NBA-2' }],
  "Tyrese Maxey": [{ season: '2025-26', award: 'All-NBA-3' }],
  "Jamal Murray": [{ season: '2025-26', award: 'All-NBA-3' }],
  "Jalen Johnson": [{ season: '2025-26', award: 'All-NBA-3' }],
  "Chet Holmgren": [{ season: '2025-26', award: 'All-NBA-3' }],
  "Giannis Antetokounmpo": [{ season: '2021-22', award: 'All-NBA-1' }, { season: '2022-23', award: 'All-NBA-1' }, { season: '2023-24', award: 'All-NBA-1' }, { season: '2024-25', award: 'All-NBA-1' }],
  "Jayson Tatum": [{ season: '2021-22', award: 'All-NBA-1' }, { season: '2022-23', award: 'All-NBA-1' }, { season: '2023-24', award: 'All-NBA-1' }, { season: '2024-25', award: 'All-NBA-1' }],
  "Anthony Edwards": [{ season: '2023-24', award: 'All-NBA-2' }, { season: '2024-25', award: 'All-NBA-2' }],
  "LeBron James": [{ season: '2021-22', award: 'All-NBA-3' }, { season: '2022-23', award: 'All-NBA-3' }, { season: '2023-24', award: 'All-NBA-3' }, { season: '2024-25', award: 'All-NBA-2' }],
  "Stephen Curry": [{ season: '2021-22', award: 'All-NBA-2' }, { season: '2022-23', award: 'All-NBA-2' }, { season: '2023-24', award: 'All-NBA-3' }, { season: '2024-25', award: 'All-NBA-2' }],
  "Evan Mobley": [{ season: '2024-25', award: 'All-NBA-2' }],
  "Karl-Anthony Towns": [{ season: '2021-22', award: 'All-NBA-3' }, { season: '2024-25', award: 'All-NBA-3' }],
  "Tyrese Haliburton": [{ season: '2023-24', award: 'All-NBA-3' }, { season: '2024-25', award: 'All-NBA-3' }],
  "Jalen Williams": [{ season: '2024-25', award: 'All-NBA-3' }],
  "Anthony Davis": [{ season: '2023-24', award: 'All-NBA-2' }],
  "Domantas Sabonis": [{ season: '2022-23', award: 'All-NBA-3' }, { season: '2023-24', award: 'All-NBA-3' }],
  "Devin Booker": [{ season: '2021-22', award: 'All-NBA-1' }, { season: '2023-24', award: 'All-NBA-3' }],
  "Joel Embiid": [{ season: '2021-22', award: 'All-NBA-2' }, { season: '2022-23', award: 'MVP' }, { season: '2022-23', award: 'All-NBA-1' }],
  "Jimmy Butler": [{ season: '2022-23', award: 'All-NBA-2' }],
  "De'Aaron Fox": [{ season: '2022-23', award: 'All-NBA-3' }],
  "Damian Lillard": [{ season: '2022-23', award: 'All-NBA-3' }],
  "Julius Randle": [{ season: '2022-23', award: 'All-NBA-3' }],
  "Ja Morant": [{ season: '2021-22', award: 'All-NBA-2' }],
  "Trae Young": [{ season: '2021-22', award: 'All-NBA-3' }],
  "Pascal Siakam": [{ season: '2021-22', award: 'All-NBA-3' }],
}
