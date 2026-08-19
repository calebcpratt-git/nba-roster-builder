// The schema manifest behind the /data dashboard: every entity in the app's
// data model, every field on it, and the web page (if any) that field comes
// from.
//
// This is the ONLY hand-written layer of that dashboard. It deliberately holds
// just the two things that genuinely cannot be derived from the data itself:
// which URL feeds which field, and what each field means. Everything the
// dashboard reports about population — counts, percentages, sample values — is
// computed live from the real rows by schema-coverage.ts, so this file can
// never make a stale claim about what is populated.
//
// KEEPING IT CURRENT: any change to a schema interface or a source URL must
// update this file in the same change (see CLAUDE.md). scripts/check-schema-drift.ts
// enforces that in CI by diffing declared fields against the real data and
// declared URLs against scripts/scrape/run.py's SOURCES dict.

import { RAW_PLAYER_DATA, TEAM_NAMES, ALL_TEAMS, type RawPlayerData } from './player-data'
import { CONTRACT_DETAILS, type ContractDetail } from './contract-details'
import { TEAM_CAP_STATE, type TeamCapSeason } from './team-cap-state'
import { ENRICHED_PICKS, type DraftPick } from './draft-picks'
import { FREE_AGENT_POOL, type FreeAgentPoolEntry } from './free-agents'
import { PLAYER_ROOKIE_YEARS } from './rookie-years'
import { PLAYER_AWARDS } from './awards'
import { LEAGUE_CAP, type LeagueCapYear } from './league-cap'
import { ROOKIE_SALARIES_2026 } from './rookie-salaries'
import { SEASON_CALENDAR, type SeasonCalendar } from './season-calendar'
import { CAP_THRESHOLDS, TEAMS } from './data'
import type { CapThreshold, Season } from './types'

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type SourceCadence =
  | 'daily'          // re-fetched by every scheduled scrape
  | 'annual-post'    // a dated blog post that has to be re-pointed each season
  | 'one-time'       // seeded once, no longer part of the daily run
  | 'hand-maintained' // typed in from a document, never fetched

export interface DataSource {
  id: string
  label: string
  /** Absent for hand-maintained sources, which have no page. */
  url?: string
  /** True when `url` is a template the scraper iterates (per team, per player). */
  isTemplate?: boolean
  /**
   * Key in scripts/scrape/run.py's SOURCES dict. Absent for the per-team and
   * per-player templates each scraper module iterates on its own, and for
   * non-web sources. check-schema-drift.ts compares these against run.py so
   * a URL changed there but not here fails CI.
   */
  runPyKey?: string
  scraper: string
  cadence: SourceCadence
  note?: string
}

export const DATA_SOURCES: Record<string, DataSource> = {
  'bbref-contracts': {
    id: 'bbref-contracts',
    label: 'Basketball-Reference — contracts',
    url: 'https://www.basketball-reference.com/contracts/players.html',
    runPyKey: 'bbref_contracts',
    scraper: 'scripts/scrape/bbref.py',
    cadence: 'daily',
  },
  'bbref-draft': {
    id: 'bbref-draft',
    label: 'Basketball-Reference — draft class',
    url: 'https://www.basketball-reference.com/draft/NBA_2026.html',
    isTemplate: true,
    scraper: 'scripts/scrape/bbref.py',
    cadence: 'daily',
    note: 'run.py builds these keys from CURRENT_DRAFT_YEAR (the current draft year and the one before it), so there is no fixed SOURCES key to pin — bump the URL here when CURRENT_DRAFT_YEAR moves.',
  },
  'bbref-player-pages': {
    id: 'bbref-player-pages',
    label: 'Basketball-Reference — player pages',
    url: 'https://www.basketball-reference.com/players/{first}/{bbrefId}.html',
    isTemplate: true,
    scraper: 'scripts/scrape/bbref.py',
    cadence: 'daily',
  },
  'bbref-transactions': {
    id: 'bbref-transactions',
    label: 'Basketball-Reference — season transactions',
    url: 'https://www.basketball-reference.com/leagues/NBA_{year}_transactions.html',
    isTemplate: true,
    scraper: 'scripts/scrape/backfill_acquisitions.py',
    cadence: 'one-time',
    note: 'The depth source for Player.acquisitionHistory — a season\'s page is only fully published once that season has closed, so it can never be the DAILY source (that\'s SalarySwish\'s job, for the in-progress season). Run manually/occasionally to extend how many past seasons of history are on file; re-running is safe, entries are merged and deduped rather than replaced.',
  },
  'bbref-awards': {
    id: 'bbref-awards',
    label: 'Basketball-Reference — season awards',
    url: 'https://www.basketball-reference.com/awards/awards_{year}.html',
    isTemplate: true,
    scraper: 'scripts/scrape/bbref_awards.py',
    cadence: 'daily',
    note: 'Only the last 5 closed seasons (AWARDS_YEARS in run.py) are fetched — an in-progress season\'s winners aren\'t known until it ends, so there is no current-season page to add. Re-fetched daily like any other GROUPS source, but the underlying facts for a closed season never change.',
  },
  'realgm-future-drafts': {
    id: 'realgm-future-drafts',
    label: 'RealGM — future drafts',
    url: 'https://basketball.realgm.com/nba/draft/future_drafts/team',
    runPyKey: 'realgm_future_drafts',
    scraper: 'scripts/scrape/realgm.py',
    cadence: 'daily',
  },
  'realgm-free-agent-options': {
    id: 'realgm-free-agent-options',
    label: 'RealGM — free agent options',
    url: 'https://basketball.realgm.com/nba/free_agent_options',
    runPyKey: 'realgm_free_agent_options',
    scraper: 'scripts/scrape/realgm.py',
    cadence: 'daily',
  },
  'realgm-current-free-agents': {
    id: 'realgm-current-free-agents',
    label: 'RealGM — current free agents',
    url: 'https://basketball.realgm.com/nba/current_free_agents',
    runPyKey: 'realgm_current_free_agents',
    scraper: 'scripts/scrape/realgm.py',
    cadence: 'daily',
  },
  'hr-guarantee-dates': {
    id: 'hr-guarantee-dates',
    label: 'Hoops Rumors — salary guarantee dates',
    url: 'https://www.hoopsrumors.com/2026/05/early-nba-salary-guarantee-dates-for-2026-27.html',
    runPyKey: 'hr_guarantee_dates',
    scraper: 'scripts/scrape/hoopsrumors.py',
    cadence: 'annual-post',
  },
  'hr-non-guaranteed': {
    id: 'hr-non-guaranteed',
    label: 'Hoops Rumors — non-guaranteed contracts',
    url: 'https://www.hoopsrumors.com/2026/07/2026-27-non-guaranteed-contracts-by-team.html',
    runPyKey: 'hr_non_guaranteed',
    scraper: 'scripts/scrape/hoopsrumors.py',
    cadence: 'annual-post',
  },
  'hr-trade-kickers': {
    id: 'hr-trade-kickers',
    label: 'Hoops Rumors — trade kickers',
    url: 'https://www.hoopsrumors.com/2025/08/nba-players-with-trade-kickers-in-2025-26.html',
    runPyKey: 'hr_trade_kickers',
    scraper: 'scripts/scrape/hoopsrumors.py',
    cadence: 'annual-post',
    note: 'Still the 2025/26 post — the 2026/27 version had not been published as of the last pipeline update. Records are still correct for "who currently has a kicker".',
  },
  'hr-veto-trades': {
    id: 'hr-veto-trades',
    label: 'Hoops Rumors — players who can veto trades',
    url: 'https://www.hoopsrumors.com/2025/07/nba-players-who-can-veto-trades-in-2025-26.html',
    runPyKey: 'hr_veto_trades',
    scraper: 'scripts/scrape/hoopsrumors.py',
    cadence: 'annual-post',
    note: 'Still the 2025/26 post — the 2026/27 version had not been published as of the last pipeline update.',
  },
  'hr-cash-in-trade': {
    id: 'hr-cash-in-trade',
    label: 'Hoops Rumors — cash sent/received in trades',
    url: 'https://www.hoopsrumors.com/2025/08/cash-sent-received-in-nba-trades-for-2025-26.html',
    runPyKey: 'hr_cash_in_trade',
    scraper: 'scripts/scrape/hoopsrumors.py',
    cadence: 'annual-post',
    note: 'Still the 2025/26 post — the 2026/27 version had not been published as of the last pipeline update.',
  },
  'hr-two-way-tracker': {
    id: 'hr-two-way-tracker',
    label: 'Hoops Rumors — two-way contract tracker',
    url: 'https://www.hoopsrumors.com/2026/07/2026-27-nba-two-way-contract-tracker.html',
    runPyKey: 'hr_two_way_tracker',
    scraper: 'scripts/scrape/hoopsrumors.py',
    cadence: 'daily',
    note: 'Evergreen — Hoops Rumors updates this post in place all season, so unlike the other HR posts it needs no yearly URL bump.',
  },
  'salaryswish-transactions': {
    id: 'salaryswish-transactions',
    label: 'SalarySwish — per-team transactions',
    url: 'https://www.salaryswish.com/transactions/{slug}',
    isTemplate: true,
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
    note: '30 pages, one per team.',
  },
  'salaryswish-players': {
    id: 'salaryswish-players',
    label: 'SalarySwish — per-player pages',
    url: 'https://salaryswish.com/players/{slug}',
    isTemplate: true,
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
    note: '~475 pages, cached between runs — see run.py::build_signing_incentives.',
  },
  'salaryswish-trade-exceptions': {
    id: 'salaryswish-trade-exceptions',
    label: 'SalarySwish — trade exception tracker',
    url: 'https://salaryswish.com/trade-exception',
    runPyKey: 'salaryswish_trade_exceptions',
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
  },
  'salaryswish-hard-cap': {
    id: 'salaryswish-hard-cap',
    label: 'SalarySwish — hard cap tracker',
    url: 'https://salaryswish.com/hard-cap-tracker',
    runPyKey: 'salaryswish_hard_cap',
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
  },
  'salaryswish-mle': {
    id: 'salaryswish-mle',
    label: 'SalarySwish — mid-level exception tracker',
    url: 'https://salaryswish.com/mid-level-exception',
    runPyKey: 'salaryswish_mle',
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
  },
  'salaryswish-bae': {
    id: 'salaryswish-bae',
    label: 'SalarySwish — bi-annual exception tracker',
    url: 'https://salaryswish.com/bi-annual-exception',
    runPyKey: 'salaryswish_bae',
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
  },
  'salaryswish-dpe': {
    id: 'salaryswish-dpe',
    label: 'SalarySwish — disabled player exception tracker',
    url: 'https://salaryswish.com/disabled-player-exception',
    runPyKey: 'salaryswish_dpe',
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
  },
  'salaryswish-sitemap': {
    id: 'salaryswish-sitemap',
    label: 'SalarySwish — sitemap',
    url: 'https://salaryswish.com/sitemap.xml',
    runPyKey: 'salaryswish_sitemap',
    scraper: 'scripts/scrape/salaryswish.py',
    cadence: 'daily',
    note: 'An index, not a data page: it resolves player names to the URL slugs the per-player pages live at. Feeds no field directly.',
  },
  'captracker-teams': {
    id: 'captracker-teams',
    label: 'nbacaptracker.com — team pages',
    url: 'https://www.nbacaptracker.com/teams/{slug}',
    isTemplate: true,
    scraper: 'scripts/scrape/captracker.py',
    cadence: 'daily',
    note: '30 pages, one per team.',
  },
  'cap-memo': {
    id: 'cap-memo',
    label: 'NBA/NBPA cap memo',
    scraper: '—',
    cadence: 'hand-maintained',
    note: 'Typed in each July when the league publishes the new figures. Not scraped.',
  },
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface FieldSpec<Row> {
  /** Dotted path as it appears on the row, e.g. 'acquisition.method'. */
  path: string
  type: string
  description: string
  /** DATA_SOURCES ids. An empty array means no source has been identified. */
  sources: string[]
  /** Set when the value is computed app-side rather than read from a page. */
  derived?: string
  /**
   * Set when 0 population in the snapshot is expected rather than a pipeline
   * gap — e.g. a value the user supplies interactively that never appears in
   * generated data. Suppresses the "no value" warning treatment in the
   * dashboard and drift-check notes; the string explains why.
   */
  expectedEmpty?: string
  /** Reads the field off a real row — drives live coverage and sample values. */
  get: (row: Row) => unknown
}

export interface ForeignKeySpec {
  /** FieldSpec.path on this entity that holds the reference. */
  field: string
  /** DATA_ENTITIES id being referenced. */
  toEntity: string
  /** FieldSpec.path on the target entity the value corresponds to. Falls back to the target's own primaryKey[0] when omitted. */
  toField?: string
  /** Short label drawn on the connector line — defaults to `field`. */
  label?: string
}

export interface EntitySpec<Row = any> {
  id: string
  label: string
  /** Where the type and (for generated entities) the data live. */
  file: string
  description: string
  /** How this entity joins to others, in plain language. */
  relationships?: string[]
  /** Field path(s) that jointly identify a row — drives the key marker in the ERD. Omitted when the source data has no natural key (see draft-pick). */
  primaryKey?: string[]
  /** Outgoing references to other entities — the edges the ERD draws. */
  foreignKeys?: ForeignKeySpec[]
  keyOf: (row: Row) => string
  rows: () => Row[]
  fields: FieldSpec<Row>[]
}

// --- Player ---------------------------------------------------------------

const playerEntity: EntitySpec<RawPlayerData> = {
  id: 'player',
  label: 'Player',
  file: 'lib/player-data.ts',
  description:
    'Every player under contract to an NBA team, with per-season salary and option flags. The spine of the app — the roster table, cap math, and trade validation all read from here.',
  relationships: [
    'Joined to ContractDetail by display name through nameLookup() in lib/player-key.ts, not by id.',
    'Grouped onto Team by the `team` abbreviation.',
    'Player.id is assigned at runtime in lib/data.ts as `player-${idx}` per team — it is not stable and does not exist upstream.',
  ],
  primaryKey: ['name'],
  foreignKeys: [{ field: 'team', toEntity: 'team', toField: 'abbreviation', label: 'team' }],
  keyOf: (p) => p.name,
  rows: () => RAW_PLAYER_DATA,
  fields: [
    { path: 'name', type: 'string', description: 'Display name, and the join key to ContractDetail and PLAYER_ROOKIE_YEARS.', sources: ['bbref-contracts'], get: (p) => p.name },
    { path: 'team', type: 'string', description: 'Current team abbreviation.', sources: ['bbref-contracts', 'salaryswish-transactions'], get: (p) => p.team },
    { path: 'salary', type: 'Partial<Record<Season, number | null>>', description: 'Per-season salary in whole dollars.', sources: ['bbref-contracts'], get: (p) => p.salary },
    { path: 'options', type: 'Partial<Record<Season, "Team" | "Player" | null>>', description: 'Which seasons carry a team or player option. Stale same-season flags are corrected against RealGM\'s current-free-agents list.', sources: ['bbref-contracts', 'realgm-free-agent-options', 'realgm-current-free-agents'], get: (p) => p.options },
    { path: 'guarantees', type: 'Partial<Record<Season, SeasonGuarantee>>', description: 'Guarantee status, partial amount, and the date salary becomes fully guaranteed. An absent season means full.', sources: ['hr-guarantee-dates', 'hr-non-guaranteed'], get: (p) => p.guarantees },
    { path: 'acquisitionHistory', type: 'AcquisitionRecord[]', description: 'Every known transaction that moved this player to a new team, ascending by date — the last 5 completed seasons (Basketball-Reference) plus the current season (SalarySwish). Needed to tell whether a trade to the player\'s current team fell within his first four seasons, one of the supermax (Designated Veteran) eligibility legs.', sources: ['bbref-transactions', 'salaryswish-transactions'], get: (p) => p.acquisitionHistory },
    { path: 'contractType', type: "'two-way' | undefined", description: 'Marks a two-way deal, which is excluded from Team Salary and counts against the 3-slot limit. The salary attached is the flat league-wide two-way figure, not a negotiated number.', sources: ['hr-two-way-tracker'], get: (p) => p.contractType },
  ],
}

// --- ContractDetail -------------------------------------------------------

type ContractDetailRow = ContractDetail & { playerName: string }

const contractDetailEntity: EntitySpec<ContractDetailRow> = {
  id: 'contract-detail',
  label: 'Contract detail',
  file: 'lib/contract-details.ts',
  description:
    'The contract mechanics a salary figure alone does not capture — trade kickers, incentives, which exception paid for the deal, no-trade clauses. Read by trade validation.',
  relationships: ['Keyed by raw display name; always read through nameLookup() so accent and case variants resolve.'],
  primaryKey: ['playerName'],
  foreignKeys: [{ field: 'playerName', toEntity: 'player', toField: 'name', label: 'playerName' }],
  keyOf: (c) => c.playerName,
  rows: () => Object.entries(CONTRACT_DETAILS).map(([playerName, detail]) => ({ playerName, ...detail })),
  fields: [
    { path: 'playerName', type: 'string', description: 'Join key back to Player.name.', sources: ['salaryswish-players'], get: (c) => c.playerName },
    { path: 'tradeBonusPct', type: 'number', description: 'Trade kicker as a percentage of remaining salary, accelerated into the acquiring team\'s incoming figure.', sources: ['hr-trade-kickers'], get: (c) => c.tradeBonusPct },
    { path: 'incentives', type: 'Partial<Record<Season, { likely: number; unlikely: number }>>', description: 'Likely and unlikely incentive dollars per season. A meaningful share come back as {0, 0} — unverified whether that means no incentives or a parser miss.', sources: ['salaryswish-players'], get: (c) => c.incentives },
    { path: 'signedUnder', type: "'minimum' | 'rookie-scale' | 'bird' | 'early-bird' | 'non-bird' | 'non-taxpayer-mle' | 'taxpayer-mle' | 'room-mle' | 'bi-annual' | 'cap-room' | 'max'", description: 'Which exception financed the deal.', sources: ['salaryswish-players'], get: (c) => c.signedUnder },
    { path: 'noTradeClause', type: 'boolean', description: 'Whether the player can veto a trade. A couple dozen players league-wide.', sources: ['hr-veto-trades'], get: (c) => c.noTradeClause },
    { path: 'priorSeasonSalary', type: 'number', description: 'Last season\'s actual salary, needed for Base-Year Compensation and the >120% re-sign lock.', sources: [], get: (c) => c.priorSeasonSalary },
    { path: 'poisonPill', type: '{ outgoingValue: number; incomingValue: number }', description: 'Signed-but-not-yet-active rookie-scale extension, which trades at different outgoing and incoming values.', sources: [], get: (c) => c.poisonPill },
  ],
}

// --- TeamCapState ---------------------------------------------------------

type TeamCapStateRow = TeamCapSeason & { team: string; season: string }

const teamCapStateEntity: EntitySpec<TeamCapStateRow> = {
  id: 'team-cap-state',
  label: 'Team cap state',
  file: 'lib/team-cap-state.ts',
  description:
    'Per team, per season: the cap obligations that sit outside the roster itself — dead money, cap holds, held trade exceptions, and this year\'s exception and cash usage.',
  relationships: [
    'One row per team × season. hardCapped, cashLedger and exceptionsUsed exist only for the current season — they are running state, not projections.',
  ],
  primaryKey: ['team', 'season'],
  foreignKeys: [{ field: 'team', toEntity: 'team', toField: 'abbreviation', label: 'team' }],
  keyOf: (t) => `${t.team} ${t.season}`,
  rows: () =>
    Object.entries(TEAM_CAP_STATE).flatMap(([team, seasons]) =>
      Object.entries(seasons).map(([season, state]) => ({ team, season, ...(state as TeamCapSeason) }))
    ),
  fields: [
    { path: 'team', type: 'string', description: 'Team abbreviation.', sources: ['captracker-teams'], get: (t) => t.team },
    { path: 'season', type: 'Season', description: 'League year this row describes.', sources: ['captracker-teams'], get: (t) => t.season },
    { path: 'deadMoney', type: 'DeadMoney[]', description: 'Waived and stretched cap hits still on the books.', sources: ['captracker-teams'], get: (t) => t.deadMoney },
    { path: 'capHolds', type: 'CapHold[]', description: 'Offseason free-agent, draft-pick, and empty-roster holds. Free-agent holds are reconciled against RealGM because CapTracker projects them forward without knowing who already re-signed or retired.', sources: ['captracker-teams', 'realgm-current-free-agents'], get: (t) => t.capHolds },
    { path: 'heldTPEs', type: 'HeldTPE[]', description: 'Traded-player exceptions on hand and available to absorb incoming salary.', sources: ['salaryswish-trade-exceptions'], get: (t) => t.heldTPEs },
    { path: 'apronAddon', type: 'number', description: 'The gap between raw cap hit and Apron Team Salary. A close lower bound, not the exact league figure — smaller cap-hold and rookie-minimum true-ups are not sourced anywhere.', sources: ['salaryswish-players'], derived: 'Summed app-side from each roster player\'s scraped unlikely incentives.', get: (t) => t.apronAddon },
    { path: 'hardCapped', type: 'HardCapStatus', description: 'Already hard-capped this league year, and at which apron. Current season only.', sources: ['salaryswish-hard-cap'], get: (t) => t.hardCapped },
    { path: 'cashLedger', type: 'CashLedger', description: 'Remaining room under the 5.15%-of-cap cash-in-trade limit. Send and receive are tracked separately and do not net. Current season only.', sources: ['hr-cash-in-trade'], get: (t) => t.cashLedger },
    { path: 'exceptionsUsed', type: 'ExceptionsUsed', description: 'MLE / BAE / DPE / TPE usage, read straight from SalarySwish\'s own live-computed trackers rather than re-derived app-side. Current season only.', sources: ['salaryswish-mle', 'salaryswish-bae', 'salaryswish-dpe', 'salaryswish-trade-exceptions'], get: (t) => t.exceptionsUsed },
  ],
}

// --- DraftPick ------------------------------------------------------------

const draftPickEntity: EntitySpec<DraftPick> = {
  id: 'draft-pick',
  label: 'Draft pick',
  file: 'lib/draft-picks.ts',
  description:
    'Future draft-pick ownership through 2032, including protections and swap rights, and the rookie-scale salary each pick would carry if exercised.',
  relationships: [
    'Owned by a Team via teamOwner; teamFrom names the original owner when the pick was traded.',
    'protection and swap are parsed app-side out of the raw protections/swapOption strings — best-effort regex, not a real grammar.',
  ],
  // RealGM's future-drafts listing has no natural key — teamOwner+year+round
  // isn't unique (a team can hold more than one pick in the same round/year
  // via separate trade chains), and there's no id in the raw data.
  foreignKeys: [
    { field: 'teamOwner', toEntity: 'team', toField: 'fullName', label: 'teamOwner' },
    { field: 'teamFrom', toEntity: 'team', toField: 'fullName', label: 'teamFrom' },
    { field: 'swapOwner', toEntity: 'team', toField: 'fullName', label: 'swapOwner' },
  ],
  keyOf: (p) => `${p.year} ${p.round} ${p.teamOwner}`,
  rows: () => ENRICHED_PICKS,
  fields: [
    { path: 'teamOwner', type: 'string', description: 'Team that currently owns the pick.', sources: ['realgm-future-drafts'], get: (p) => p.teamOwner },
    { path: 'year', type: 'number', description: 'Draft year.', sources: ['realgm-future-drafts'], get: (p) => p.year },
    { path: 'round', type: "'First Round' | 'Second Round'", description: 'Which round.', sources: ['realgm-future-drafts'], get: (p) => p.round },
    { path: 'teamFrom', type: 'string | null', description: 'Original owner, when the pick has changed hands.', sources: ['realgm-future-drafts'], get: (p) => p.teamFrom },
    { path: 'swapOwner', type: 'string | null', description: 'Team holding a swap right over this pick.', sources: ['realgm-future-drafts'], get: (p) => p.swapOwner },
    { path: 'swapOption', type: 'string | null', description: 'Raw swap text as RealGM writes it.', sources: ['realgm-future-drafts'], get: (p) => p.swapOption },
    { path: 'protections', type: 'string | null', description: 'Raw protection text as RealGM writes it.', sources: ['realgm-future-drafts'], get: (p) => p.protections },
    { path: 'protection', type: 'PickProtection', description: 'Structured form of `protections`, parsed app-side by parseProtection() — best-effort regex, not a real grammar. Not currently read by any trade-validation logic.', sources: [], derived: 'Calculated app-side from `protections` — not read from a page.', get: (p) => p.protection },
    { path: 'swap', type: 'SwapRight', description: 'Structured form of `swapOption`, parsed app-side by parseSwap(). Only `withTeams` is ever filled in — `favorable` and `condition` aren\'t derivable from the raw text.', sources: [], derived: 'Calculated app-side from `swapOption` — not read from a page.', get: (p) => p.swap },
    { path: 'pickNumber', type: 'number | null', description: 'Draft slot. RealGM lists future picks without a slot, so this stays null until the user predicts one for a specific pick via pickNumberOverrides.', sources: [], expectedEmpty: 'Never comes from a source — it\'s a per-pick user prediction (pickNumberOverrides), not pipeline data, so 0/521 here is expected.', get: (p) => p.pickNumber },
    { path: 'pickPool', type: 'string | null', description: 'Pool the pick belongs to, as RealGM groups them.', sources: ['realgm-future-drafts'], get: (p) => p.pickPool },
    { path: 'rank', type: 'string | null', description: 'RealGM\'s ordering hint for the pick.', sources: ['realgm-future-drafts'], get: (p) => p.rank },
  ],
}

// --- FreeAgentPoolEntry ---------------------------------------------------

const freeAgentEntity: EntitySpec<FreeAgentPoolEntry> = {
  id: 'free-agent',
  label: 'Free agent pool',
  file: 'lib/free-agents.ts',
  description:
    'Players who are currently unsigned, so they have no roster row in player-data.ts. A snapshot of who is available right now, not a projection of future free agency.',
  relationships: ['Disjoint from Player by construction — a player appears in one or the other, never both.'],
  primaryKey: ['name'],
  foreignKeys: [{ field: 'priorTeam', toEntity: 'team', toField: 'abbreviation', label: 'priorTeam' }],
  keyOf: (f) => f.name,
  rows: () => FREE_AGENT_POOL,
  fields: [
    { path: 'name', type: 'string', description: 'Display name.', sources: ['realgm-current-free-agents'], get: (f) => f.name },
    { path: 'position', type: 'string', description: 'Raw position abbreviation from RealGM (e.g. "PG", "SF-PF"). Undefined when the column was blank.', sources: ['realgm-current-free-agents'], get: (f) => f.position },
    { path: 'priorTeam', type: 'string', description: 'Team the player last played for.', sources: ['realgm-current-free-agents'], get: (f) => f.priorTeam },
    { path: 'faType', type: "'unrestricted' | 'restricted'", description: 'Whether the prior team can match an offer sheet.', sources: ['realgm-current-free-agents'], get: (f) => f.faType },
    { path: 'birdRights', type: "'non-bird' | 'early-bird' | 'full-bird'", description: 'Which Bird exception the prior team holds. Undefined means unmatched in RealGM\'s list, not "no Bird rights".', sources: ['realgm-current-free-agents'], get: (f) => f.birdRights },
  ],
}

// --- RookieYear -----------------------------------------------------------

type RookieYearRow = { name: string; rookieYear: number }

const rookieYearEntity: EntitySpec<RookieYearRow> = {
  id: 'rookie-year',
  label: 'Rookie year',
  file: 'lib/rookie-years.ts',
  description: 'The season each player entered the league, which drives years-of-service and therefore minimum-salary and extension eligibility.',
  relationships: ['Keyed by display name, same convention as ContractDetail.'],
  primaryKey: ['name'],
  foreignKeys: [{ field: 'name', toEntity: 'player', toField: 'name', label: 'name' }],
  keyOf: (r) => r.name,
  rows: () => Object.entries(PLAYER_ROOKIE_YEARS).map(([name, rookieYear]) => ({ name, rookieYear })),
  fields: [
    { path: 'name', type: 'string', description: 'Join key back to Player.name.', sources: ['bbref-contracts'], get: (r) => r.name },
    { path: 'rookieYear', type: 'number', description: 'Calendar year of the player\'s first NBA season.', sources: ['bbref-draft', 'bbref-player-pages'], get: (r) => r.rookieYear },
  ],
}

// --- AwardRecord -----------------------------------------------------------

type AwardHistoryRow = { name: string; season: string; award: string }

const awardEntity: EntitySpec<AwardHistoryRow> = {
  id: 'award',
  label: 'Award',
  file: 'lib/awards.ts',
  description:
    'MVP, DPOY, and All-NBA team selections for the last 5 completed seasons — the Higher Max Criteria a supermax (Designated Veteran) extension requires. MVP/DPOY are the outright winner only (rank 1 in the voting table), not every candidate on the ballot.',
  relationships: ['Keyed by display name, same convention as ContractDetail and RookieYear.'],
  primaryKey: ['name', 'season', 'award'],
  foreignKeys: [{ field: 'name', toEntity: 'player', toField: 'name', label: 'name' }],
  keyOf: (a) => `${a.name} ${a.season} ${a.award}`,
  rows: () => Object.entries(PLAYER_AWARDS).flatMap(([name, awards]) => awards.map((a) => ({ name, ...a }))),
  fields: [
    { path: 'name', type: 'string', description: 'Join key back to Player.name.', sources: ['bbref-awards'], get: (a) => a.name },
    { path: 'season', type: 'string (YYYY-YY)', description: 'Season the award covers. Not the app\'s Season type — reaches into past seasons outside the cap-sheet projection window.', sources: ['bbref-awards'], get: (a) => a.season },
    { path: 'award', type: "'MVP' | 'DPOY' | 'All-NBA-1' | 'All-NBA-2' | 'All-NBA-3'", description: 'Which honor.', sources: ['bbref-awards'], get: (a) => a.award },
  ],
}

// --- LeagueCapYear --------------------------------------------------------

type LeagueCapRow = LeagueCapYear & { season: string }

const leagueCapEntity: EntitySpec<LeagueCapRow> = {
  id: 'league-cap',
  label: 'League cap year',
  file: 'lib/league-cap.ts',
  description:
    'The league-wide dollar figures the cap engine reads: thresholds, salary-matching brackets, exception amounts, and the cash-in-trade limit. Hand-maintained from the cap memo.',
  relationships: ['`official: false` marks a projected season rather than a published one.'],
  primaryKey: ['season'],
  keyOf: (l) => l.season,
  rows: () => Object.entries(LEAGUE_CAP).map(([season, year]) => ({ season, ...year })),
  fields: [
    { path: 'season', type: 'Season', description: 'League year.', sources: ['cap-memo'], get: (l) => l.season },
    { path: 'official', type: 'boolean', description: 'True once the figures are published in the cap memo; false means projection.', sources: ['cap-memo'], get: (l) => l.official },
    { path: 'softCap', type: 'number', description: 'Salary cap.', sources: ['cap-memo'], get: (l) => l.softCap },
    { path: 'luxuryTax', type: 'number', description: 'Luxury tax line.', sources: ['cap-memo'], get: (l) => l.luxuryTax },
    { path: 'firstApron', type: 'number', description: 'First apron.', sources: ['cap-memo'], get: (l) => l.firstApron },
    { path: 'secondApron', type: 'number', description: 'Second apron.', sources: ['cap-memo'], get: (l) => l.secondApron },
    { path: 'salaryFloor', type: 'number', description: 'Minimum team payroll.', sources: ['cap-memo'], get: (l) => l.salaryFloor },
    { path: 'matching', type: '{ lowerCeiling, upperFloor, middleCushion, flatCushion }', description: 'The 2023 CBA expanded-TPE salary-matching brackets.', sources: ['cap-memo'], get: (l) => l.matching },
    { path: 'minimumByYos', type: 'Record<number, number>', description: 'Minimum-salary cap hit by years of service. A two-tier scale, not a per-year step scale — the CBA caps what any ≤2-year minimum deal counts against the cap.', sources: ['cap-memo'], get: (l) => l.minimumByYos },
    { path: 'exceptions', type: '{ nonTaxpayerMLE, taxpayerMLE, roomMLE, biAnnual }', description: 'Exception dollar amounts. 2026-27 is spot-checked against live SalarySwish data; later seasons are scaled from an older estimate and self-flagged as projections.', sources: ['cap-memo'], get: (l) => l.exceptions },
    { path: 'cashInTradeLimit', type: 'number', description: '5.15%-of-cap cash-in-trade limit.', sources: ['cap-memo'], get: (l) => l.cashInTradeLimit },
  ],
}

// --- CapThreshold ---------------------------------------------------------

type CapThresholdRow = CapThreshold & { season: string }

const capThresholdEntity: EntitySpec<CapThresholdRow> = {
  id: 'cap-threshold',
  label: 'Cap threshold',
  file: 'lib/data.ts',
  description: 'The same threshold figures as LeagueCapYear, shaped as labelled rows for the UI to render as lines on the cap sheet.',
  relationships: ['Mirrors LEAGUE_CAP — the two are hand-kept in step.'],
  primaryKey: ['season', 'name'],
  keyOf: (c) => `${c.season} ${c.name}`,
  rows: () =>
    (Object.entries(CAP_THRESHOLDS) as [Season, CapThreshold[]][]).flatMap(([season, thresholds]) =>
      thresholds.map((t) => ({ season, ...t }))
    ),
  fields: [
    { path: 'season', type: 'Season', description: 'League year.', sources: ['cap-memo'], get: (c) => c.season },
    { path: 'name', type: 'string', description: 'Display label.', sources: ['cap-memo'], get: (c) => c.name },
    { path: 'value', type: 'number', description: 'Threshold in whole dollars.', sources: ['cap-memo'], get: (c) => c.value },
    { path: 'type', type: "'soft-cap' | 'salary-floor' | 'luxury-tax' | 'first-apron' | 'second-apron' | 'hard-cap'", description: 'Which line this is.', sources: ['cap-memo'], get: (c) => c.type },
    { path: 'description', type: 'string', description: 'Explanatory text shown in the UI.', sources: ['cap-memo'], get: (c) => c.description },
  ],
}

// --- RookieSalary ---------------------------------------------------------

type RookieSalaryRow = { pick: number; year1: number; year2: number; year3: number; year4: number }

const rookieSalaryEntity: EntitySpec<RookieSalaryRow> = {
  id: 'rookie-salary',
  label: 'Rookie scale',
  file: 'lib/rookie-salaries.ts',
  description: 'The 2026 first-round rookie scale by pick. Later draft years are scaled from it by the ratio of that season\'s cap.',
  relationships: ['Applied to DraftPick.pickNumber to value an unexercised pick on the cap sheet.'],
  primaryKey: ['pick'],
  keyOf: (r) => `Pick ${r.pick}`,
  rows: () => Object.entries(ROOKIE_SALARIES_2026).map(([pick, s]) => ({ pick: Number(pick), ...s })),
  fields: [
    { path: 'pick', type: 'number', description: 'Draft slot, 1–30.', sources: ['cap-memo'], get: (r) => r.pick },
    { path: 'year1', type: 'number', description: 'First-year scale amount.', sources: ['cap-memo'], get: (r) => r.year1 },
    { path: 'year2', type: 'number', description: 'Second-year scale amount.', sources: ['cap-memo'], get: (r) => r.year2 },
    { path: 'year3', type: 'number', description: 'Third year — a team option.', sources: ['cap-memo'], get: (r) => r.year3 },
    { path: 'year4', type: 'number', description: 'Fourth year — a team option.', sources: ['cap-memo'], get: (r) => r.year4 },
  ],
}

// --- SeasonCalendar -------------------------------------------------------

type SeasonCalendarRow = SeasonCalendar & { season: string }

const seasonCalendarEntity: EntitySpec<SeasonCalendarRow> = {
  id: 'season-calendar',
  label: 'Season calendar',
  file: 'lib/season-calendar.ts',
  description:
    'The dates that gate roster moves — moratorium, trade deadline, season start and end. The per-day dead-money proration in roster-context.tsx cannot run without a season-start date.',
  primaryKey: ['season'],
  keyOf: (s) => s.season,
  rows: () => Object.entries(SEASON_CALENDAR).map(([season, cal]) => ({ season, ...(cal as SeasonCalendar) })),
  fields: [
    { path: 'season', type: 'Season', description: 'League year.', sources: ['cap-memo'], get: (s) => s.season },
    { path: 'moratoriumStart', type: 'string (ISO)', description: 'July 1 league-year rollover.', sources: ['cap-memo'], get: (s) => s.moratoriumStart },
    { path: 'moratoriumEnd', type: 'string (ISO)', description: 'When signings may be executed.', sources: ['cap-memo'], get: (s) => s.moratoriumEnd },
    { path: 'tradeDeadline', type: 'string (ISO)', description: 'Trade deadline.', sources: ['cap-memo'], get: (s) => s.tradeDeadline },
    { path: 'allStar', type: 'string (ISO)', description: 'All-Star game.', sources: ['cap-memo'], get: (s) => s.allStar },
    { path: 'seasonStart', type: 'string (ISO)', description: 'Opening night.', sources: ['cap-memo'], get: (s) => s.seasonStart },
    { path: 'seasonEnd', type: 'string (ISO)', description: 'Final day of the regular season.', sources: ['cap-memo'], get: (s) => s.seasonEnd },
    { path: 'seasonStartIsEstimate', type: 'boolean', description: 'True while seasonStart is a reported date rather than the league\'s published schedule.', sources: ['cap-memo'], get: (s) => s.seasonStartIsEstimate },
  ],
}

// --- Team -----------------------------------------------------------------

type TeamRow = { abbreviation: string; name: string; city: string; primaryColor: string; secondaryColor: string; fullName: string }

const teamEntity: EntitySpec<TeamRow> = {
  id: 'team',
  label: 'Team',
  file: 'lib/data.ts',
  description: 'The 30 franchises, their display names and brand colors. Static reference data.',
  relationships: [
    'Referenced by abbreviation from Player.team, TeamCapState.team, and DraftPick.teamOwner.',
    'lib/types.ts also declares a richer `Team` interface with conference and division — nothing populates or reads it.',
  ],
  primaryKey: ['abbreviation'],
  keyOf: (t) => t.abbreviation,
  rows: () =>
    ALL_TEAMS.map((abbreviation) => ({
      abbreviation,
      fullName: TEAM_NAMES[abbreviation],
      ...(TEAMS[abbreviation] ?? { name: '', city: '', primaryColor: '', secondaryColor: '' }),
    })),
  fields: [
    { path: 'abbreviation', type: 'string', description: 'Three-letter code used as the foreign key everywhere else.', sources: ['cap-memo'], get: (t) => t.abbreviation },
    { path: 'fullName', type: 'string', description: 'Full franchise name.', sources: ['cap-memo'], get: (t) => t.fullName },
    { path: 'city', type: 'string', description: 'City.', sources: ['cap-memo'], get: (t) => t.city },
    { path: 'name', type: 'string', description: 'Nickname.', sources: ['cap-memo'], get: (t) => t.name },
    { path: 'primaryColor', type: 'string (hex)', description: 'Primary brand color.', sources: ['cap-memo'], get: (t) => t.primaryColor },
    { path: 'secondaryColor', type: 'string (hex)', description: 'Secondary brand color.', sources: ['cap-memo'], get: (t) => t.secondaryColor },
  ],
}

export const DATA_ENTITIES: EntitySpec<any>[] = [
  playerEntity,
  contractDetailEntity,
  teamCapStateEntity,
  draftPickEntity,
  freeAgentEntity,
  rookieYearEntity,
  awardEntity,
  leagueCapEntity,
  capThresholdEntity,
  rookieSalaryEntity,
  seasonCalendarEntity,
  teamEntity,
]

export function getEntity(id: string): EntitySpec<any> | undefined {
  return DATA_ENTITIES.find((e) => e.id === id)
}

// ---------------------------------------------------------------------------
// ERD graph — resolves the declared foreignKeys into edges and a left-to-
// right layout. Structural (derived from the manifest, not from live data),
// so it lives here rather than in schema-coverage.ts.
// ---------------------------------------------------------------------------

export interface ErdEdge {
  from: string   // entity id
  field: string  // FK field path on `from`
  toEntity: string
  toField: string // resolved target field path
  label: string
}

/**
 * Flattened, resolved foreign-key edges across every entity. `toField`
 * defaults to the target's own primaryKey[0] when a FK doesn't name one —
 * the "connect to the identifying id" behavior the ERD relies on.
 */
export function erdEdges(): ErdEdge[] {
  const edges: ErdEdge[] = []
  for (const entity of DATA_ENTITIES) {
    for (const fk of entity.foreignKeys ?? []) {
      const target = getEntity(fk.toEntity)
      const toField = fk.toField ?? target?.primaryKey?.[0]
      if (!toField) continue
      edges.push({ from: entity.id, field: fk.field, toEntity: fk.toEntity, toField, label: fk.label ?? fk.field })
    }
  }
  return edges
}

/**
 * Left-to-right tier per entity for the ERD layout: an entity with no
 * outgoing foreign keys is tier 0 (a hub, or standalone reference data);
 * anything else sits one tier to the right of whatever it references.
 */
export function erdTiers(): Record<string, number> {
  const tiers: Record<string, number> = {}
  const edges = erdEdges()

  function depth(id: string, stack: Set<string>): number {
    if (tiers[id] !== undefined) return tiers[id]
    if (stack.has(id)) return 0 // guard against an accidental cycle
    stack.add(id)
    const outs = edges.filter((e) => e.from === id)
    const d = outs.length === 0 ? 0 : 1 + Math.max(...outs.map((e) => depth(e.toEntity, stack)))
    stack.delete(id)
    tiers[id] = d
    return d
  }

  for (const entity of DATA_ENTITIES) depth(entity.id, new Set())
  return tiers
}
