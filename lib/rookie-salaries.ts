const BASE_CAP = 150_000_000

// Soft cap by season — used for both second-round scaling and future rookie scale scaling
const CAP_BY_SEASON: Record<string, number> = {
  '2025-26': 145_000_000,
  '2026-27': 150_000_000,
  '2027-28': 155_000_000,
  '2028-29': 160_000_000,
  '2029-30': 165_000_000,
  '2030-31': 170_000_000,
  '2031-32': 175_000_000,
  '2032-33': 180_000_000,
  '2033-34': 185_000_000,
  '2034-35': 190_000_000,
}
// Second round picks: $1.3M base in 2026-27 (cap $150M), scaled proportionally each season
const SECOND_ROUND_BASE = 1_300_000
export const SECOND_ROUND_SALARY_BY_SEASON: Record<string, number> = Object.fromEntries(
  Object.entries(CAP_BY_SEASON).map(([season, cap]) => [
    season,
    Math.round(SECOND_ROUND_BASE * (cap / BASE_CAP)),
  ])
)

// Scale the 2026 rookie scale for a given draft year using cap proportionality
export function getScaledRookieSalary(pickNumber: number, draftYear: number) {
  const base = ROOKIE_SALARIES_2026[pickNumber]
  if (!base) return null
  const startSeason = `${draftYear}-${String(draftYear + 1).slice(2)}`
  const cap = CAP_BY_SEASON[startSeason] ?? BASE_CAP
  const ratio = cap / BASE_CAP
  return {
    year1: Math.round(base.year1 * ratio),
    year2: Math.round(base.year2 * ratio),
    year3: Math.round(base.year3 * ratio),
    year4: Math.round(base.year4 * ratio),
  }
}

// NBA 2026 First Round Rookie Scale Contracts
// Year 3 and Year 4 are Team Options
export const ROOKIE_SALARIES_2026: Record<number, {
  year1: number
  year2: number
  year3: number
  year4: number
}> = {
  1:  { year1: 15_208_560, year2: 15_969_240, year3: 16_729_560, year4: 21_095_976 },
  2:  { year1: 13_607_400, year2: 14_287_920, year3: 14_968_560, year4: 18_890_323 },
  3:  { year1: 12_219_840, year2: 12_830_280, year3: 13_441_800, year4: 16_990_435 },
  4:  { year1: 11_017_320, year2: 11_568_240, year3: 12_119_280, year4: 15_330_889 },
  5:  { year1:  9_976_800, year2: 10_475_400, year3: 10_974_240, year4: 13_904_363 },
  6:  { year1:  9_061_440, year2:  9_514_560, year3:  9_967_920, year4: 12_639_323 },
  7:  { year1:  8_272_080, year2:  8_685_840, year3:  9_099_120, year4: 11_555_882 },
  8:  { year1:  7_578_120, year2:  7_957_080, year3:  8_336_040, year4: 10_603_444 },
  9:  { year1:  6_965_760, year2:  7_314_480, year3:  7_662_600, year4:  9_762_152 },
  10: { year1:  6_617_640, year2:  6_948_360, year3:  7_278_840, year4:  9_280_522 },
  11: { year1:  6_286_680, year2:  6_601_200, year3:  6_915_600, year4:  9_177_001 },
  12: { year1:  5_972_520, year2:  6_271_320, year3:  6_570_000, year4:  9_053_460 },
  13: { year1:  5_673_720, year2:  5_957_640, year3:  6_241_200, year4:  8_918_675 },
  14: { year1:  5_390_400, year2:  5_659_920, year3:  5_929_680, year4:  8_781_857 },
  15: { year1:  5_120_520, year2:  5_376_480, year3:  5_632_440, year4:  8_634_532 },
  16: { year1:  4_864_560, year2:  5_107_920, year3:  5_351_400, year4:  8_209_048 },
  17: { year1:  4_621_200, year2:  4_852_320, year3:  5_083_320, year4:  7_807_980 },
  18: { year1:  4_390_440, year2:  4_609_560, year3:  4_829_400, year4:  7_427_617 },
  19: { year1:  4_192_680, year2:  4_402_200, year3:  4_612_320, year4:  7_102_973 },
  20: { year1:  4_024_680, year2:  4_225_800, year3:  4_426_920, year4:  6_826_312 },
  21: { year1:  3_863_760, year2:  4_057_200, year3:  4_250_400, year4:  6_770_887 },
  22: { year1:  3_709_440, year2:  3_894_720, year3:  4_080_240, year4:  6_711_995 },
  23: { year1:  3_561_240, year2:  3_739_440, year3:  3_916_920, year4:  6_647_014 },
  24: { year1:  3_418_920, year2:  3_589_800, year3:  3_760_680, year4:  6_577_430 },
  25: { year1:  3_281_640, year2:  3_445_560, year3:  3_610_200, year4:  6_501_971 },
  26: { year1:  3_173_040, year2:  3_331_440, year3:  3_490_200, year4:  6_292_831 },
  27: { year1:  3_081_360, year2:  3_235_560, year3:  3_390_000, year4:  6_115_560 },
  28: { year1:  3_062_280, year2:  3_215_880, year3:  3_368_880, year4:  6_080_828 },
  29: { year1:  3_040_320, year2:  3_192_240, year3:  3_344_400, year4:  6_036_642 },
  30: { year1:  3_018_240, year2:  3_169_080, year3:  3_320_280, year4:  5_993_106 },
}
