"""Fetch -> parse -> normalize. Writes JSON for the Node generators to consume.

Usage:  python scripts/scrape/run.py [--offline] [--rescue=name1,name2]
  --offline        reuse snapshots/raw/*.html instead of hitting the network
  --rescue=names   comma-separated keys from SOURCES below to fetch live and
                    rebuild only the groups that depend on them, leaving
                    every other group's already-committed output untouched —
                    for re-fetching a single source that failed on a run from
                    a flagged IP (e.g. GitHub Actions hitting RealGM's
                    Cloudflare block) without disturbing the ~30 sources that
                    already succeeded. Implies --offline is irrelevant: a
                    rescue never falls back to local snapshots/raw/ for
                    anything outside the named set, since that directory
                    isn't synced from the GitHub Actions run and may be
                    arbitrarily stale.

Resilience:
  Each source is fetched with a few retries and a short backoff, because
  RealGM sits behind Cloudflare and intermittently returns 403 to datacenter
  IPs like GitHub Actions runners (a fresh request usually flips to 200). If a
  source still fails after every retry, the run does NOT abort: it keeps the
  last committed snapshots/scraped/*.json for that group and updates the
  rest, so one dead source no longer takes down everything else. The run only
  exits non-zero if every group is unreachable.

Groups (each independent — a failure in one never blocks the others):
  players             SalarySwish team rosters (30 pages) +        -> players.json, rookie-years.json, unresolved-draft-year.json,
                      BBRef draft classes                             camp-invites.json, salaryswish-dead-money.json
  free-agent-pool     RealGM current-free-agents                  -> free-agents.json (currently-unsigned players not in players.json)
                      (same fallback as above)
  picks               RealGM future drafts                        -> draft-picks.json
  enrichment          SalarySwish per-team transactions (30        -> merged onto players.json (acquisition, guarantees)
                      pages) + HR guarantee data
  clauses             HR trade kickers + veto-trades               -> contract-details.json
  cap-state           nbacaptracker.com (30 team pages)            -> team-cap-state.json
  salaryswish-league  SalarySwish trade-exception + hard-cap       -> merged onto team-cap-state.json (heldTPEs, hardCapped)
                      trackers (2 league-wide pages)
  signing-incentives  SalarySwish per-player pages (~475, cached   -> merged onto contract-details.json (signedUnder, incentives)
                      between runs — see build_signing_incentives)
  cash-ledger         Hoops Rumors cash-sent/received post         -> merged onto team-cap-state.json (cashLedger)
  apron-addon         derived from signing-incentives' unlikely    -> merged onto team-cap-state.json (apronAddon)
                      incentive sums — no new fetch of its own

NOTE ON DATED URLS: the Hoops Rumors sources below are annual blog posts with
season-specific URLs, not stable endpoints. HR_TRADE_KICKERS_URL,
HR_VETO_TRADES_URL, and HR_CASH_IN_TRADE_URL below are still pointing at the
2025/26 articles because, as of this pipeline's last update (July 2026),
Hoops Rumors had not yet published the 2026/27 versions (they typically go up
in August). Records pulled from a still-current older-season article are
still correct for "who currently has X" purposes but check for the 2026/27
version each time you re-run this and update the URL when it exists —
search "hoopsrumors nba players with trade kickers 2026/27",
"hoopsrumors nba players who can veto trades 2026/27", and
"hoopsrumors cash sent received nba trades 2026/27".
"""
import json, os, re, sys, time, random, unicodedata, urllib.request, urllib.error
from datetime import date

import bbref, bbref_awards, realgm, hoopsrumors, captracker, salaryswish, name_bridge
from name_bridge import _base  # moved here from this module so name_bridge itself can use it without a circular import — see name_bridge.py

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'snapshots', 'raw')
CAPTRACKER_RAW = os.path.join(RAW, 'nbacaptracker')
SS_TEAM_TRANSACTIONS_RAW = os.path.join(RAW, 'salaryswish_transactions')
SS_TEAM_ROSTERS_RAW = os.path.join(RAW, 'salaryswish_rosters')
SALARYSWISH_PLAYERS_RAW = os.path.join(RAW, 'salaryswish_players')
OUT = os.path.join(ROOT, 'snapshots', 'scraped')
ROOKIE_YEARS_TS = os.path.join(ROOT, 'lib', 'rookie-years.ts')
SS_PLAYER_CACHE = os.path.join(OUT, 'salaryswish-players.json')
ACQUISITION_HISTORY_LEDGER = os.path.join(OUT, 'acquisition-history-ledger.json')
SS_FETCH_DELAY = 1.2  # polite delay between per-player fetches — see salaryswish.py's module docstring

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'
CURRENT_DRAFT_YEAR = 2026          # bump each June after the draft
DRAFT_YEARS = [CURRENT_DRAFT_YEAR, CURRENT_DRAFT_YEAR - 1]
CURRENT_SEASON_YEAR = 2026         # calendar year the current season starts — bump each July
CURRENT_SEASON_LABEL = f'{CURRENT_SEASON_YEAR}-{str(CURRENT_SEASON_YEAR + 1)[-2:]}'  # e.g. '2026-27'

# Last 5 CLOSED seasons' BBRef awards pages (award winners for an
# in-progress season aren't known until it ends, so there's no "current
# season" page to include here — unlike CURRENT_SEASON_YEAR itself, which
# names the season already published as of last July, this only needs
# bumping if the backfill depth should change).
AWARDS_YEARS = [CURRENT_SEASON_YEAR - i for i in range(5)]

# UPDATE THESE EACH SEASON — see the module docstring note above.
HR_GUARANTEE_DATES_URL = 'https://www.hoopsrumors.com/2026/05/early-nba-salary-guarantee-dates-for-2026-27.html'
HR_NON_GUARANTEED_URL = 'https://www.hoopsrumors.com/2026/07/2026-27-non-guaranteed-contracts-by-team.html'
HR_TRADE_KICKERS_URL = 'https://www.hoopsrumors.com/2025/08/nba-players-with-trade-kickers-in-2025-26.html'   # STALE — 2026/27 not yet published as of last update
HR_VETO_TRADES_URL = 'https://www.hoopsrumors.com/2025/07/nba-players-who-can-veto-trades-in-2025-26.html'    # STALE — 2026/27 not yet published as of last update
HR_CASH_IN_TRADE_URL = 'https://www.hoopsrumors.com/2025/08/cash-sent-received-in-nba-trades-for-2025-26.html'  # STALE — 2026/27 not yet published as of last update
# Trades SalarySwish (or another source) has reported but that have NOT
# actually been executed — e.g. agreed-to-in-principle deals later put on
# hold. Every transaction matching (name, date) here is dropped before it
# ever reaches acquisition matching in build_enrichment, so the player(s)
# involved keep showing on their real, current team with their real salary
# instead of being moved to a team they haven't actually joined. Remove an
# entry here once the trade is confirmed executed (or confirmed dead) so
# this stops silently overriding fresh data.
FROZEN_TRANSACTIONS = {
    # Kawhi Leonard (LAC) / Brandon Ingram + Gradey Dick (TOR) — reported
    # 2026-06-30, put on hold before closing; confirmed frozen as of 2026-08-10.
    ('Gradey Dick', '2026-06-30'),
    ('Brandon Ingram', '2026-06-30'),
    ('Kawhi Leonard', '2026-06-30'),
}

SOURCES = {
    'realgm_future_drafts': 'https://basketball.realgm.com/nba/draft/future_drafts/team',
    'realgm_current_free_agents': 'https://basketball.realgm.com/nba/current_free_agents',
    'hr_guarantee_dates': HR_GUARANTEE_DATES_URL,
    'hr_non_guaranteed': HR_NON_GUARANTEED_URL,
    'hr_trade_kickers': HR_TRADE_KICKERS_URL,
    'hr_veto_trades': HR_VETO_TRADES_URL,
    'hr_cash_in_trade': HR_CASH_IN_TRADE_URL,
    'salaryswish_trade_exceptions': salaryswish.TRADE_EXCEPTION_URL,
    'salaryswish_hard_cap': salaryswish.HARD_CAP_URL,
    'salaryswish_mle': salaryswish.MLE_URL,
    'salaryswish_bae': salaryswish.BAE_URL,
    'salaryswish_dpe': salaryswish.DPE_URL,
    'salaryswish_sitemap': salaryswish.SITEMAP_URL,
    **{f'bbref_draft_{y}': f'https://www.basketball-reference.com/draft/NBA_{y}.html' for y in DRAFT_YEARS},
    **{f'bbref_awards_{y}': f'https://www.basketball-reference.com/awards/awards_{y}.html' for y in AWARDS_YEARS},
}

# Per-team/per-player sources that fetch many pages in their own loop
# instead of going through SOURCES/fetch_all — the dashboard has no single
# ok/failed signal for these from `source_fetches` alone, so each build
# function that owns one of these loops records {total, failed: [labels]}
# here. Untouched on a --rescue run (none of these loops are rescuable
# individually), so main() carries the previous run's entries forward.
PAGE_GROUPS = {}

MIN_BYTES = 20_000        # smaller than this = a challenge/error page, not real content
FETCH_TRIES = 5           # total attempts per source before giving up
BACKOFF_BASE = 4          # seconds; doubles each retry (4, 8, 16, 32...) plus jitter


def fetch_one(name, url):
    """Fetch one source into snapshots/raw, retrying on transient failures
    (403/429/network/too-small). Returns True on success, False if it still
    failed after FETCH_TRIES attempts."""
    path = os.path.join(RAW, f'{name}.html')
    for attempt in range(1, FETCH_TRIES + 1):
        try:
            headers = {'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'}
            if name.startswith('realgm'):
                # RealGM's Cloudflare bot-management treats this header as a signal of
                # normal in-browser traffic; confirmed via manual testing to flip 403->200
                # consistently, does not apply to the other sources.
                headers['X-Requested-With'] = 'XMLHttpRequest'
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < MIN_BYTES:
                raise RuntimeError(f'suspiciously small response ({len(data)} bytes)')
            open(path, 'wb').write(data)
            print(f'  fetched  {name}  ({len(data):,} bytes)'
                  + (f'  [attempt {attempt}]' if attempt > 1 else ''))
            return True
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as e:
            reason = getattr(e, 'code', None) or getattr(e, 'reason', None) or e
            if attempt < FETCH_TRIES:
                wait = BACKOFF_BASE * (2 ** (attempt - 1)) + random.uniform(0, 2)
                print(f'  retry    {name}  ({reason}) — attempt {attempt}/{FETCH_TRIES}, '
                      f'waiting {wait:.0f}s')
                time.sleep(wait)
            else:
                print(f'  FAILED   {name}  ({reason}) — gave up after {FETCH_TRIES} attempts')
    return False


def fetch_all(offline=False, rescue=None, rescue_strict=False):
    """Fetch every single-URL source. Never raises for a single source;
    returns the set of source names that could not be obtained this run.

    `rescue`, if given, is a set of SOURCES keys to fetch live even when
    `offline` is set — see the --rescue usage note in the module docstring.

    `rescue_strict`, when a rescue is running, treats every OTHER source as
    unavailable rather than falling back to whatever's in snapshots/raw/ —
    that directory is .gitignored and nothing repopulates it from the daily
    GitHub Actions run (the runner's copy is discarded when the job ends), so
    a local file there could be leftover from some unrelated earlier local
    run and arbitrarily stale. Confirmed live 2026-08-13: a rescue reused a
    6-day-old local bbref_contracts.html for the 'players' group (BBRef's
    contracts page, since retired — see build_players), silently reverting
    ~180 lines of since-committed roster changes it had no way of knowing
    about.

    The one exception: a raw file last written earlier *today* (by an
    earlier rescue this same session) is reused rather than marked
    unavailable. That's what lets a multi-source group — e.g. enrichment,
    which needs both hr_guarantee_dates and hr_non_guaranteed — complete
    once every source it needs has been fetched today, even across separate
    rescue clicks, without forcing every rescue to re-list every source the
    group depends on. Anything older than today still gets marked
    unavailable, so main()'s existing skip-and-keep-last-good-output logic
    still protects every group whose sources haven't actually been
    refreshed today."""
    rescue = rescue or set()
    os.makedirs(RAW, exist_ok=True)
    failed = set()
    for name, url in SOURCES.items():
        path = os.path.join(RAW, f'{name}.html')
        if name in rescue:
            if not fetch_one(name, url):
                failed.add(name)
            time.sleep(4)          # be a polite guest between sources
            continue
        if rescue_strict:
            if os.path.exists(path) and date.fromtimestamp(os.path.getmtime(path)) == date.today():
                print(f'  reuse    {name}  (already fetched earlier today)')
                continue
            print(f'  skip     {name}  (not fetched today; leaving its group untouched)')
            failed.add(name)
            continue
        if offline:
            if os.path.exists(path):
                print(f'  offline  {name}')
            else:
                print(f'  MISSING  {name}  (no snapshot; --offline)')
                failed.add(name)
            continue
        if not fetch_one(name, url):
            failed.add(name)
        time.sleep(4)
    return failed


def _cached_source(name, cache_name, parse_fn):
    """Parses name.html if today's fetch produced it, else falls back to the
    committed cache_name.json — the last successfully-parsed copy of that
    same page. snapshots/raw/ is gitignored and discarded at the end of
    every CI run, so a failed fetch used to leave nothing to fall back to:
    the group depending on it was skipped outright, silently regressing
    whatever a PRIOR successful run had already merged onto players.json or
    team-cap-state.json. Confirmed live 2026-08-14 on the (since-retired)
    free-agent-option-reconciliation step: a single failed
    realgm_current_free_agents fetch let 81 already-resolved option flags
    reappear in players.json, all clearing again at once the next day the
    fetch succeeded — a misleadingly large one-day diff instead of steady
    state. Falling back to the last-good parsed data (rather than skipping)
    keeps every day's corrections/rows in place even through a one-day fetch
    outage — the general rule any reconciliation step here should follow:
    never let a transient fetch failure regress data a prior successful run
    already fixed, when the last-good parse of that same page is sitting
    right here in a committed snapshot."""
    path = os.path.join(RAW, f'{name}.html')
    if os.path.exists(path):
        data = parse_fn(path)
        json.dump(data, open(os.path.join(OUT, f'{cache_name}.json'), 'w'), indent=1, ensure_ascii=False)
        return data
    cached = _load_json(cache_name, [])
    print(f'  {name} fetch failed — reusing {len(cached)} cached record(s) from the last successful fetch')
    return cached


def existing_rookie_years():
    if not os.path.exists(ROOKIE_YEARS_TS):
        return {}
    src = open(ROOKIE_YEARS_TS, encoding='utf-8').read()
    return {_base(m[0]): int(m[1]) for m in re.findall(r'"([^"]+)"\s*:\s*(\d{4})', src)}


def _load_json(name, default):
    path = os.path.join(OUT, f'{name}.json')
    if not os.path.exists(path):
        return default
    return json.load(open(path, encoding='utf-8'))


UNRESOLVED_FILES = {
    'draft-year': 'unresolved-draft-year',
    'acquisition': 'unresolved-acquisition',
    'guarantees': 'unresolved-guarantees',
    'signing': 'unresolved-signing',
    'awards': 'unresolved-awards',
    'name-bridge': 'name-bridge-unmatched',
    'no-current-salary': 'unresolved-no-current-salary',
}


def count_unresolved():
    """Snapshot of unresolved-*.json record counts, keyed by short label.
    Called once before this run touches anything and once after, so main()
    can tell whether this run introduced NEW unmatched entries (a real
    regression worth blocking auto-merge on) versus carrying forward the
    same steady-state undrafted/unmatched players every run has."""
    return {label: len(_load_json(name, []) or []) for label, name in UNRESOLVED_FILES.items()}


def snapshot_unresolved_records():
    """Same idea as count_unresolved(), but keeps the actual records rather
    than just their count — so the /data dashboard can show WHICH entries
    are new this run, not just how many."""
    return {label: _load_json(name, []) or [] for label, name in UNRESOLVED_FILES.items()}


def _unresolved_identity(record):
    """These records have no real id — identity is the person, keyed by
    whichever name field the category uses. Diffing on the full record
    (rather than just this key) would count a corrected date or reason on
    the same person as a remove+add, inflating "new this run"."""
    return record.get('name') or record.get('player')


def new_unresolved_records(before, after):
    """Records for a person present in `after` but not `before` — the
    identities behind the before/after count delta."""
    result = {}
    for label, after_list in after.items():
        before_identities = {_unresolved_identity(r) for r in before.get(label, [])}
        new = [r for r in after_list if _unresolved_identity(r) not in before_identities]
        if new:
            result[label] = new
    return result


ROSTER_SECTIONS = {'Active', 'Minors/G-League', 'Disabled', 'Inactive'}


def _canonical_name_index():
    """{squash(name): name} built from the PREVIOUS run's already-committed
    players.json — the same "last-good persisted state is the canonical
    record" pattern existing_rookie_years() already uses for rookie years
    (reads lib/rookie-years.ts) and _cached_source() uses for a failed
    fetch. This is what lets a name already established under BBRef's old
    display form (e.g. "Alex Sarr") stay that way once SalarySwish becomes
    the source, instead of every player's display name flipping to
    whatever SalarySwish happens to render today — see name_bridge.py's
    module docstring for the canonical-name policy this implements."""
    previous_players = _load_json('players', [])
    return name_bridge.build_canonical_index(p['name'] for p in previous_players)


def build_players():
    """Fetches and parses all 30 SalarySwish /teams/{slug} roster pages and
    writes players.json, rookie-years.json, and unresolved-draft-year.json —
    same three output files build_players has always written, so every
    downstream generator/consumer is untouched, even though the source
    underneath (SalarySwish roster pages, not BBRef's contracts page) is
    entirely new as of the 2026-09 migration. See salaryswish.py's
    parse_team_roster for the page structure this reads.

    Only the Active / Minors-G-League / Disabled / Inactive sections become
    players.json rows (ROSTER_SECTIONS) — these are the sections that
    represent real, currently-rostered cap occupancy. Training Camp and
    Exhibit 10 invites are non-guaranteed camp deals that don't count
    against the cap; they're written to snapshots/scraped/camp-invites.json
    instead so they're visible rather than silently dropped. Waivers and
    Buyout rows are dead money, written to
    snapshots/scraped/salaryswish-dead-money.json — NOT merged into
    players.json; this overlaps captracker's existing deadMoneyPlayers
    (team-cap-state.json), and reconciling the two is a deliberate
    follow-up, not part of this change (see the migration plan's "out of
    scope" list). UFA/RFA/FA-Cap-Hold/pick-hold sections are dropped
    entirely here — the free-agent pool and cap holds still come from
    RealGM/nbacaptracker exactly as before; SalarySwish's own versions of
    those are a separate, later change."""
    offline = '--offline' in sys.argv  # same flag main() reads; not worth threading through GROUPS' build() signature
    canonical_index = _canonical_name_index()

    failed_teams = salaryswish.fetch_team_rosters(SS_TEAM_ROSTERS_RAW, offline=offline)
    PAGE_GROUPS['salaryswish-rosters'] = {
        'total': len(salaryswish.TEAM_SLUG_TO_ABBR),
        'failed': sorted(salaryswish.TEAM_SLUG_TO_ABBR[s] for s in failed_teams),
    }
    if len(failed_teams) == len(salaryswish.TEAM_SLUG_TO_ABBR):
        raise RuntimeError('every salaryswish roster page failed to fetch')
    if failed_teams:
        print(f'  WARN {len(failed_teams)} salaryswish roster page(s) failed to fetch, '
              f'proceeding with the rest: {sorted(failed_teams)}')
    rows = salaryswish.parse_all_team_rosters(SS_TEAM_ROSTERS_RAW)

    sitemap_path = os.path.join(RAW, 'salaryswish_sitemap.html')
    slug_by_squash = {}
    if os.path.exists(sitemap_path):
        try:
            slug_by_squash = salaryswish.parse_sitemap_slugs(sitemap_path)
        except RuntimeError as e:
            print(f'  WARNING  salaryswish sitemap unusable ({e}) — name-bridge tier 3 disabled this run')

    KEPT_SECTIONS = ROSTER_SECTIONS | {'Waivers', 'Buyout', 'Training Camp and Exhibit 10'}
    unmatched_names = []
    no_current_salary = []
    players, camp_invites, dead_money = [], [], []
    for row in rows:
        if row['section'] not in KEPT_SECTIONS:
            # UFA/RFA/FA-Cap-Hold/pick holds — not roster occupancy (see
            # docstring), and skipped before name-bridge matching too: most
            # are retired/international draft-rights names with no
            # canonical form to match against, which would otherwise flood
            # name-bridge-unmatched.json with noise.
            continue

        canonical, _tier = name_bridge.match_name(row['name'], canonical_index, slug_by_squash)
        if canonical is None:
            unmatched_names.append(row['name'])
        name = canonical or row['name']

        if row['section'] in ('Waivers', 'Buyout'):
            dead_money.append({**row, 'name': name})
            continue
        if row['section'] == 'Training Camp and Exhibit 10':
            camp_invites.append({**row, 'name': name})
            continue

        if CURRENT_SEASON_LABEL not in row['salary']:
            # A roster-section row with no confirmed CURRENT-season cap
            # figure isn't actually under contract right now — SalarySwish
            # still lists them under their old team's Active section (that's
            # where they were last rostered) but shows an RFA/UFA tag in the
            # season-1 cell instead of a dollar figure, because their next
            # deal isn't finalized. Confirmed live: Jalen Duren (DET) — an
            # empty players.json row for him would silently hide him from
            # build_free_agent_pool too, since that function only adds a
            # RealGM free agent who has NO players.json row at all. Skipping
            # him here (instead of adding a $0/empty row) is what lets
            # build_free_agent_pool's RealGM-sourced check correctly pick
            # him up as a free agent instead.
            no_current_salary.append({'name': name, 'team': row['team'], 'section': row['section']})
            continue

        current_option = row['options'].get(CURRENT_SEASON_LABEL)
        options = dict(row['options'])
        if current_option and row['optionsAccepted'].get(CURRENT_SEASON_LABEL):
            # SalarySwish flags the decision directly (a CSS class + a
            # "Team/Player Option Accepted (date)" title on the option div)
            # once an option is exercised — CURRENT_SEASON_LABEL only ever
            # names a season after that season's option deadlines have
            # already passed, so a still-present, still-accepted option
            # flag here is stale: the decision is made, there's nothing left
            # for a user to toggle. A DECLINED option doesn't show up as an
            # option cell at all (the player just isn't on this roster
            # section anymore), so there is currently no live "pending"
            # case for THIS season — confirmed live across all 30 teams,
            # 2026-09-02: every current-season option was already accepted.
            options.pop(CURRENT_SEASON_LABEL, None)

        player = {
            'name': name,
            'team': row['team'],
            'salary': row['salary'],
            'options': options,
            'cashSalary': row['cashSalary'],
            'guaranteed': row['guaranteed'],
            'likelyIncentives': row['likelyIncentives'],
            # Per-season, ALL seasons (not just current) — the direct
            # SalarySwish "accepted" signal used above, not a guarantee/
            # cap-hit heuristic. Nothing consumes this yet; it exists so a
            # future UI can show "team option, exercised" as a fact instead
            # of a live toggle, at which point the CURRENT_SEASON_LABEL
            # popping above can be retired in favor of just reading this.
            'optionExercised': row['optionsAccepted'],
        }
        if row['terms'] == 'Two-Way' or row['section'] == 'Minors/G-League':
            player['contractType'] = 'two-way'
        if row['acquiredMethod']:
            player['acquiredMethod'] = row['acquiredMethod']
        players.append(player)

    name_bridge.write_unmatched_report(unmatched_names)
    if unmatched_names:
        print(f'  name-bridge: {len(unmatched_names)} SalarySwish name(s) had no canonical match '
              f'(new players are expected here; see name-bridge-unmatched.json)')

    draft = []
    for y in DRAFT_YEARS:
        draft += bbref.parse_draft(os.path.join(RAW, f'bbref_draft_{y}.html'), y)
    by_name = {_base(d['name']): d['draftYear'] for d in draft}
    known = existing_rookie_years()

    rookie_years, unresolved = {}, []
    for p in players:
        year = by_name.get(_base(p['name'])) or known.get(_base(p['name']))
        if year:
            rookie_years[p['name']] = year
        else:
            unresolved.append({'name': p['name'], 'team': p['team']})

    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(rookie_years, open(os.path.join(OUT, 'rookie-years.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved, open(os.path.join(OUT, 'unresolved-draft-year.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(camp_invites, open(os.path.join(OUT, 'camp-invites.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(dead_money, open(os.path.join(OUT, 'salaryswish-dead-money.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(no_current_salary, open(os.path.join(OUT, 'unresolved-no-current-salary.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  players {len(players)}   draft years {len(rookie_years)}   unresolved {len(unresolved)}   '
          f'camp invites {len(camp_invites)}   dead money {len(dead_money)}   '
          f'no-current-salary {len(no_current_salary)}')
    if unresolved:
        print('  (unresolved draft years are undrafted players — expected, not an error)')
    if no_current_salary:
        print('  (no-current-salary rows are dropped from players.json — expect them to show up '
              'in free-agents.json via RealGM instead)')


def build_picks():
    """Parse the RealGM half and write its scraped file."""
    picks, pick_stats = realgm.parse_picks(os.path.join(RAW, 'realgm_future_drafts.html'))
    picks = [p for p in picks if p['year'] != CURRENT_DRAFT_YEAR]  # already converted to real players
    json.dump(picks, open(os.path.join(OUT, 'draft-picks.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  picks {len(picks)}   '
          f'(count-reconciled: {pick_stats["sections"] - pick_stats["unreconciled"]}/{pick_stats["sections"]} sections)')


def build_enrichment():
    """Merges acquisition history (BBRef backfill + SalarySwish per-team
    transactions daily) and guarantees (Hoops Rumors) onto players.json.
    Requires players.json to already exist — either freshly written this run
    by build_players(), or last-good from a previous run — since this only
    enriches existing player records, never creates new ones. Unmatched
    entries are written to unresolved-*.json rather than dropped or treated
    as a hard failure, matching the unresolved-draft-year.json precedent
    already in this pipeline.

    Acquisition is a full history now, not a single most-recent record —
    see backfill_acquisitions.py's module docstring for why: SalarySwish's
    team pages only cover roughly the last few months (confirmed live
    2026-08-07: the Suns' page only reaches back to 2026-03-24), so on their
    own they can never answer "was this player traded to his current team
    within his first four seasons." backfill_acquisitions.py seeds
    ACQUISITION_HISTORY_LEDGER with several years of depth from BBRef's past
    season-transactions pages (a manual, occasional script, not part of this
    daily run); this function appends each day's freshest SalarySwish
    matches on top of that seed and re-applies the full merged history onto
    every matched player. History entries don't need to agree with the
    player's CURRENT team field (from BBRef's contracts page, a separately
    fetched source that can lag SalarySwish by a few days — confirmed live
    2026-08-07 on Kentavious Caldwell-Pope's PHI signing showing up here
    before BBRef's contracts page caught up) — a past transaction stays true
    regardless of what the contracts page currently shows, so unlike the old
    single-record design there's no team-match guard needed here.

    Fetch failure here (all 30 team pages) doesn't take down guarantees
    processing — it's not in the `enrichment` GROUPS entry's required
    sources, same as RealGM was before it."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')
    by_id = {p.get('bbrefId'): p for p in players if p.get('bbrefId')}
    by_name = {_base(p['name']): p for p in players}

    # --- acquisition history (BBRef backfill for depth + SalarySwish daily
    # for currency — see ACQUISITION_HISTORY_LEDGER and this function's
    # docstring above) ---
    ledger = _load_json('acquisition-history-ledger', {})

    ss_offline = '--offline' in sys.argv
    ss_failed_teams = salaryswish.fetch_team_transactions(SS_TEAM_TRANSACTIONS_RAW, offline=ss_offline)
    PAGE_GROUPS['salaryswish-transactions'] = {
        'total': len(salaryswish.TEAM_SLUG_TO_ABBR),
        'failed': sorted(salaryswish.TEAM_SLUG_TO_ABBR[s] for s in ss_failed_teams),
    }
    if ss_failed_teams:
        print(f'  WARN {len(ss_failed_teams)} salaryswish team-transaction page(s) failed to fetch, '
              f'proceeding with the rest: {sorted(ss_failed_teams)}')
    if len(ss_failed_teams) == len(salaryswish.TEAM_SLUG_TO_ABBR):
        raise RuntimeError('every salaryswish team-transaction page failed to fetch')
    transactions = salaryswish.parse_all_team_transactions(SS_TEAM_TRANSACTIONS_RAW)
    frozen = [t for t in transactions if (t['name'], t['date']) in FROZEN_TRANSACTIONS]
    if frozen:
        print(f'  {len(frozen)} transaction(s) dropped as frozen (see FROZEN_TRANSACTIONS): '
              f'{[f["name"] for f in frozen]}')
    transactions = [t for t in transactions if (t['name'], t['date']) not in FROZEN_TRANSACTIONS]

    unresolved_acq = []
    added_acq = 0
    deduped_acq = 0
    for t in transactions:
        if not t['date'] or not t.get('toTeams') or not t['toTeams'][0]:
            continue
        target = by_id.get(t.get('bbrefId')) or by_name.get(_base(t['name']))
        if target is None:
            unresolved_acq.append({'name': t['name'], 'date': t['date'], 'method': t['method']})
            continue
        # Key off the RESOLVED player's own identity, not whatever
        # identifier this source record happened to carry — SalarySwish's
        # daily transactions never carry a bbrefId at all (confirmed in
        # salaryswish.py — always None), so without this a player ends up
        # with two separate ledger entries: one bbrefId-keyed from the BBRef
        # backfill, one name-keyed from today's SalarySwish match.
        key = target.get('bbrefId') or _base(target['name'])
        entry = {'date': t['date'], 'method': t['method'], 'team': t['toTeams'][0]}
        history = ledger.setdefault(key, [])
        if any(h['date'] == entry['date'] and h['method'] == entry['method'] and h['team'] == entry['team']
               for h in history):
            deduped_acq += 1
        else:
            history.append(entry)
            added_acq += 1

    # Apply every player's full history (backfilled + accumulated daily), not
    # just today's matches — a player untouched today still keeps whatever
    # history the ledger already has for them.
    for key, history in ledger.items():
        target = by_id.get(key) or by_name.get(key)
        if target is None:
            continue
        target['acquisitionHistory'] = sorted(history, key=lambda h: h['date'])

    json.dump(ledger, open(ACQUISITION_HISTORY_LEDGER, 'w'), indent=1, ensure_ascii=False)

    # --- guarantees (Hoops Rumors, two pages merged; exact-date page wins on conflict) ---
    # _cached_source() rather than a direct parse: this function must be safe
    # to call even when hr_guarantee_dates/hr_non_guaranteed weren't fetched
    # today (see the 'enrichment' override in main(), below) — falling back
    # to the last committed parse instead of crashing on a missing raw file.
    exact = _cached_source('hr_guarantee_dates', 'hr-guarantee-dates',
                            lambda p: hoopsrumors.parse_guarantee_dates(p, CURRENT_SEASON_YEAR))
    team_wide = _cached_source('hr_non_guaranteed', 'hr-non-guaranteed', hoopsrumors.parse_non_guaranteed_by_team)
    season_label = CURRENT_SEASON_LABEL
    VALID_GUARANTEE_STATUS = {'full', 'partial', 'non-guaranteed'}
    unresolved_guar = []
    matched_guar = 0
    for g in exact + team_wide:
        if g.get('status') not in VALID_GUARANTEE_STATUS:
            # Prose HR hasn't described in a recognized shape (see
            # hoopsrumors.py's parse_guarantee_dates 'unknown' fallback) —
            # surface for manual review rather than write an invalid
            # GuaranteeStatus into player-data.ts.
            unresolved_guar.append(g)
            continue
        target = by_name.get(_base(g['player']))
        if target is None:
            unresolved_guar.append(g)
            continue
        guarantees = target.setdefault('guarantees', {})
        entry = {'status': g['status']}
        if g.get('status') == 'partial' and g.get('partialAmount') is not None:
            entry['amount'] = g['partialAmount']
        if g.get('guaranteeDate') and re.match(r'^\d{4}-\d{2}-\d{2}$', g['guaranteeDate']):
            entry['guaranteeDate'] = g['guaranteeDate']
        # exact-date records (with a real ISO date) take priority over the
        # team-wide page's coarser records if a player appears in both
        if season_label not in guarantees or entry.get('guaranteeDate'):
            guarantees[season_label] = entry
            matched_guar += 1

    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(transactions, open(os.path.join(OUT, 'transactions.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved_acq, open(os.path.join(OUT, 'unresolved-acquisition.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved_guar, open(os.path.join(OUT, 'unresolved-guarantees.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  acquisition history: {added_acq} new record(s) added today ({deduped_acq} already known)   unresolved {len(unresolved_acq)}')
    have_acq = sum(1 for p in players if p.get('acquisitionHistory'))
    print(f'  acquisition coverage: {have_acq}/{len(players)} players with history ({len(players) - have_acq} blank)')
    print(f'  guarantees matched {matched_guar}   unresolved {len(unresolved_guar)}')


def build_player_awards():
    """Basketball-Reference per-season awards pages (AWARDS_YEARS, the last
    5 closed seasons — see that constant's declaration) -> MVP/DPOY/All-NBA
    history, matched by name against players.json (same _base() normalizer
    used for BBRef draft-class joins in build_players). Unmatched rows
    (typically a retired player no longer on any current roster) go to
    unresolved-awards.json rather than being silently dropped, matching the
    unresolved-draft-year.json precedent already in this pipeline.

    Award winners for a closed season are a fixed historical fact, so unlike
    the daily acquisition/guarantee sources there's no "currency" concern
    here — a fetch failure on any one year just keeps that day's run on the
    prior committed awards.json until the next successful run, which costs
    nothing since the underlying facts don't change."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')
    by_name = {_base(p['name']): p['name'] for p in players}

    records = []
    unresolved = []
    for year in AWARDS_YEARS:
        path = os.path.join(RAW, f'bbref_awards_{year}.html')
        if not os.path.exists(path):
            continue
        for r in bbref_awards.parse_awards(path, year):
            matched_name = by_name.get(_base(r['name']))
            if matched_name is None:
                unresolved.append(r)
                continue
            records.append({'name': matched_name, 'season': r['season'], 'award': r['award']})

    json.dump(records, open(os.path.join(OUT, 'awards.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved, open(os.path.join(OUT, 'unresolved-awards.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  awards records {len(records)}   unresolved {len(unresolved)}')


def build_clauses():
    kickers = hoopsrumors.parse_trade_kickers(os.path.join(RAW, 'hr_trade_kickers.html'))
    veto = hoopsrumors.parse_veto_trades(os.path.join(RAW, 'hr_veto_trades.html'))
    by_name = {}
    for k in kickers:
        if k['section'] != 'active':
            continue  # only active-this-season kickers go into contract-details; voided/future are informational only
        rec = by_name.setdefault(_base(k['player']), {'name': k['player']})
        rec['tradeBonusPct'] = k['kickerPercent']
    for entry in veto['explicitNoTradeClause']:
        rec = by_name.setdefault(_base(entry['player']), {'name': entry['player']})
        rec['noTradeClause'] = True
    # implicit one-year-Bird veto rights are NOT written as noTradeClause=True —
    # they're a materially weaker, more-often-waived right. Not modeled in
    # ContractDetail today; surfaced only in the raw clauses-raw.json for now.
    records = list(by_name.values())
    json.dump(records, open(os.path.join(OUT, 'contract-details.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump({'tradeKickers': kickers, 'noTradeClauses': veto},
              open(os.path.join(OUT, 'clauses-raw.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  contract-details records {len(records)}   '
          f'({sum(1 for r in records if "tradeBonusPct" in r)} kickers, '
          f'{sum(1 for r in records if r.get("noTradeClause"))} explicit NTC)')


def build_free_agent_pool():
    """Writes the full list of currently-unsigned free agents, sourced from
    RealGM's current_free_agents page. Covers the players who have NO row
    in players.json at all, because no team currently employs them — e.g.
    Lonzo Ball, Ochai Agbaji. Confirmed 2026-08-07: only 8 of 152 current
    free agents had any players.json row.

    RealGM's own page can lag a real signing by days (confirmed live
    2026-08-10: Jalen Pickett still listed as a Denver free agent here
    several days after signing a two-way deal with the Clippers — a real
    transaction players.json/build_players already has via SalarySwish's
    acquisition data). Anyone who already has a players.json row is
    excluded here even if RealGM still lists them: that row means the app
    already accounts for them one way or another, so re-adding a stale/wrong
    prior team from this pool would just contradict it.
    {name, position, priorTeam, faType, birdRights} — same fields, kept as
    raw as the parser returns them (faType 'U'/'R' interpreted downstream,
    not here)."""
    players = _load_json('players', [])
    known_names = {_base(p['name']) for p in players}

    free_agents = _cached_source('realgm_current_free_agents', 'realgm-current-free-agents',
                                  realgm.parse_current_free_agents)
    pool = [fa for fa in free_agents if _base(fa['name']) not in known_names]
    skipped = len(free_agents) - len(pool)

    json.dump(pool, open(os.path.join(OUT, 'free-agents.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  free-agent pool: {len(pool)} currently-unsigned players'
          + (f'   ({skipped} skipped — already has a players.json row)' if skipped else ''))


def build_cap_state(offline=False):
    failed_teams = captracker.fetch_all(CAPTRACKER_RAW, offline=offline)
    PAGE_GROUPS['captracker-teams'] = {'total': len(captracker.TEAM_SLUGS), 'failed': sorted(failed_teams)}
    if len(failed_teams) == len(captracker.TEAM_SLUGS):
        raise RuntimeError('every nbacaptracker team page failed to fetch')
    if failed_teams:
        print(f'  WARN: {len(failed_teams)} team(s) failed to fetch, proceeding with the rest: '
              f'{sorted(failed_teams)}')
    teams = captracker.parse_all(CAPTRACKER_RAW)
    records = []
    for t in teams:
        for season_obj in t['seasonCapState']:
            season = season_obj['year'].replace('/', '-')  # '2026/27' -> '2026-27'
            dead_money = [
                {'player': p['name'], 'amount': next(
                    (s['amount'] for s in p.get('salary', []) if s.get('year') == season_obj['year']), None)}
                for p in t['deadMoneyPlayers']
            ]
            dead_money = [d for d in dead_money if d['amount'] is not None]
            cap_holds = [
                {'label': r['player_name'], 'amount': r['amount'], 'kind': (
                    'free-agent' if 'Cap Hold' in r.get('type', '') else 'empty-roster')}
                for r in t['capHoldRows'] if r.get('year') == season_obj['year']
            ]
            records.append({
                'team': t['team'], 'season': season,
                'deadMoney': dead_money, 'capHolds': cap_holds,
                'salaryCap': season_obj.get('salary_cap'),
                'taxLine': season_obj.get('tax_line'),
                'firstApron': season_obj.get('apron1'),
                'secondApron': season_obj.get('apron2'),
            })
    json.dump(records, open(os.path.join(OUT, 'team-cap-state.json'), 'w'), indent=1, ensure_ascii=False)
    total_dead = sum(len(r['deadMoney']) for r in records)
    print(f'  team-cap-state records {len(records)}   total dead-money entries {total_dead}')


def build_cap_hold_reconciliation():
    """Cross-checks free-agent-kind cap holds in team-cap-state.json's
    CURRENT_SEASON_LABEL entries against RealGM's current_free_agents page.
    nbacaptracker projects holds forward without distinguishing "still an
    active free agent" from "retired, or signed and not yet reflected" —
    this is the same class of staleness build_players' options handling
    corrects for option flags (see its docstring), applied to capHolds
    instead.

    Team-match guard on priorTeam, same anti-false-positive pattern as the
    option reconciliation: a name match alone isn't enough, since a name
    could coincidentally match a free agent who left a different team.

    Also stamps birdRights (non-bird/early-bird/full-bird) onto every
    genuinely-matched hold, sourced from RealGM's own "Veteran FA Status"
    column — only on the confirmed-same-team match, not the ambiguous
    different-team case, since that match itself is already uncertain.

    Requires team-cap-state.json to already exist (build_cap_state runs
    first)."""
    records = _load_json('team-cap-state', None)
    if records is None:
        raise RuntimeError('team-cap-state.json does not exist yet — run build_cap_state first')

    free_agents = _cached_source('realgm_current_free_agents', 'realgm-current-free-agents',
                                  realgm.parse_current_free_agents)
    fa_by_name = {}
    for fa in free_agents:
        fa_by_name[_base(fa['name'])] = fa

    removed = []
    bird_stamped = 0
    for r in records:
        if r['season'] != CURRENT_SEASON_LABEL:
            continue
        kept_holds = []
        for hold in r['capHolds']:
            if hold['kind'] != 'free-agent':
                kept_holds.append(hold)
                continue
            fa = fa_by_name.get(_base(hold['label']))
            if fa is not None and fa['priorTeam'] == r['team']:
                if fa.get('birdRights'):
                    hold['birdRights'] = fa['birdRights']
                    bird_stamped += 1
                kept_holds.append(hold)  # genuinely still an active FA — keep
            elif fa is not None:
                kept_holds.append(hold)  # name matched a different team's FA — ambiguous, keep and log
                removed.append({'team': r['team'], 'player': hold['label'], 'amount': hold['amount'],
                                 'reason': 'name-matched-different-team', 'matchedPriorTeam': fa['priorTeam']})
            else:
                removed.append({'team': r['team'], 'player': hold['label'], 'amount': hold['amount'],
                                 'reason': 'not-in-realgm-current-free-agents'})
        r['capHolds'] = kept_holds

    json.dump(records, open(os.path.join(OUT, 'team-cap-state.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(removed, open(os.path.join(OUT, 'cap-hold-overrides.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  cap-hold reconciliation: {len(removed)} stale hold(s) removed/flagged, '
          f'{bird_stamped} hold(s) stamped with birdRights')
    for o in removed:
        print(f'    {o["reason"].upper()}  {o["player"]} ({o["team"]}) ${o["amount"]}')


def build_salaryswish_league():
    """SalarySwish's league-wide trackers merged onto team-cap-state.json's
    CURRENT-season entries only — all "right now" facts, not per-season
    projections, so none apply to the future seasons nbacaptracker otherwise
    projects. Requires team-cap-state.json to already exist (build_cap_state
    runs first).

    Held TPEs and hard-cap status were the original two trackers here.
    2026-08-06 added exceptionsUsed (NTMLE/TMLE/room-MLE/BAE/DPE usage and
    remaining balance, plus which TPE financed which trade) — this is the
    field the whole "what exception has this team used, and what's left"
    question needed, read directly off SalarySwish's own live-computed
    tables. An earlier app-side derivation (lib/exceptions-used.ts, joining
    acquisition date against signedUnder) was deleted once this made it
    redundant — don't recreate it; read TEAM_CAP_STATE[team][season]
    .exceptionsUsed directly instead."""
    records = _load_json('team-cap-state', None)
    if records is None:
        raise RuntimeError('team-cap-state.json does not exist yet — run cap-state first')
    tpes = salaryswish.parse_trade_exceptions(os.path.join(RAW, 'salaryswish_trade_exceptions.html'))
    hard_caps = salaryswish.parse_hard_cap(os.path.join(RAW, 'salaryswish_hard_cap.html'))
    # The three exceptionsUsed trackers are best-effort, unlike tpes/hard_caps
    # above — a markup change or fetch failure on just one of these shouldn't
    # take down the long-established heldTPEs/hardCapped merge too.
    tpe_usage, mle, bae, dpe = [], [], [], []
    try:
        tpe_usage = salaryswish.parse_trade_exception_usage(os.path.join(RAW, 'salaryswish_trade_exceptions.html'))
    except Exception as e:
        print(f'  WARN trade-exception usage parse failed ({e}) — continuing without it')
    for name, parser, out_list in (
        ('salaryswish_mle', salaryswish.parse_mle_tracker, mle),
        ('salaryswish_bae', salaryswish.parse_bae_tracker, bae),
        ('salaryswish_dpe', salaryswish.parse_dpe_tracker, dpe),
    ):
        path = os.path.join(RAW, f'{name}.html')
        if not os.path.exists(path):
            print(f'  WARN {name}.html not fetched this run — continuing without it')
            continue
        try:
            out_list.extend(parser(path))
        except Exception as e:
            print(f'  WARN {name} parse failed ({e}) — continuing without it')
    tpes_by_team = {}
    for t in tpes:
        tpes_by_team.setdefault(t['team'], []).append(
            {'id': t['id'], 'amount': t['amount'], 'expires': t['expires'], 'fromPlayer': t['fromPlayer']})
    # A team can show up in both the tracker's 1st- and 2nd-apron tables at
    # once (hard-capped at the 1st apron by one move, the 2nd by another,
    # simultaneously) — verified live: 10/28 rows were exactly this. The 2nd
    # apron is always the binding (more restrictive) constraint, so it wins.
    hardcap_by_team = {}
    for h in hard_caps:
        existing = hardcap_by_team.get(h['team'])
        if existing is None or h['apron'] > existing['apron']:
            hardcap_by_team[h['team']] = {'apron': h['apron'], 'trigger': h['trigger']}
    tpe_usage_by_team = {}
    for u in tpe_usage:
        tpe_usage_by_team.setdefault(u['team'], []).append(
            {'tpeFromPlayer': u['tpeFromPlayer'], 'usedByPlayer': u['usedByPlayer'],
             'amount': u['amount'], 'date': u['date']})
    mle_by_team = {m['team']: m for m in mle}
    bae_by_team = {b['team']: b for b in bae}
    dpe_by_team = {d['team']: d for d in dpe}
    matched_tpe = matched_hc = matched_exceptions = 0
    for r in records:
        if r['season'] != CURRENT_SEASON_LABEL:
            continue
        if r['team'] in tpes_by_team:
            r['heldTPEs'] = tpes_by_team[r['team']]
            matched_tpe += 1
        if r['team'] in hardcap_by_team:
            r['hardCapped'] = hardcap_by_team[r['team']]
            matched_hc += 1
        exceptions_used = {}
        m = mle_by_team.get(r['team'])
        if m is not None:
            for key, remaining_key, exception_id in (
                ('nonTaxpayerMLE', 'nonTaxpayerRemaining', 'non-taxpayer-mle'),
                ('taxpayerMLE', 'taxpayerRemaining', 'taxpayer-mle'),
                ('roomMLE', 'roomRemaining', 'room-mle'),
            ):
                signings = [s for s in m['signings'] if s['exception'] == exception_id]
                remaining = m[remaining_key]
                if signings or remaining is not None:
                    exceptions_used[key] = {
                        'signings': [{'player': s['player'], 'amount': s['amount']} for s in signings],
                        'remaining': remaining,
                    }
        b = bae_by_team.get(r['team'])
        if b is not None and (b['signings'] or b['remaining'] is not None):
            exceptions_used['biAnnual'] = {'signings': b['signings'], 'remaining': b['remaining']}
        d = dpe_by_team.get(r['team'])
        if d is not None:
            exceptions_used['dpe'] = {
                'player': d['player'], 'initial': d['initial'], 'used': d['used'], 'remaining': d['room'],
            }
        if r['team'] in tpe_usage_by_team:
            exceptions_used['tradeExceptionsUsed'] = tpe_usage_by_team[r['team']]
        if exceptions_used:
            r['exceptionsUsed'] = exceptions_used
            matched_exceptions += 1
    json.dump(records, open(os.path.join(OUT, 'team-cap-state.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  held TPEs: {sum(len(v) for v in tpes_by_team.values())} across {matched_tpe} teams   '
          f'hard-capped teams: {matched_hc}   exceptionsUsed: {matched_exceptions} teams')


def build_signing_incentives(offline=False):
    """Per-player SalarySwish scrape -> signedUnder + incentives, merged onto
    contract-details.json (normally already written by build_clauses; falls
    back to an empty list rather than raising if it isn't there yet — unlike
    this file's other build_* prerequisites).
    One fetch per player (~475 league-wide) is a lot for a small independent
    site to eat every day, so this only (re)fetches a player when they're new
    to the cache (snapshots/scraped/salaryswish-players.json, committed like
    every other scraped snapshot) or their team has changed since the cached
    entry was written — a trade or new signing is exactly when the signing
    method/incentives could have changed anyway. Everyone else is reused from
    cache untouched."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')
    cache = _load_json('salaryswish-players', {})
    os.makedirs(SALARYSWISH_PLAYERS_RAW, exist_ok=True)

    # The sitemap is the authoritative slug source — slugify() is only a
    # plausible guess and is wrong for a meaningful share of real players
    # (inconsistent hyphenation of compound surnames and Jr/Sr/II suffixes,
    # e.g. /players/jaren-jacksonjr vs /players/andre-jackson-jr). Fall back
    # to slugify() per-player if the sitemap is unavailable or has no entry.
    sitemap_path = os.path.join(RAW, 'salaryswish_sitemap.html')
    slug_by_squash = {}
    if os.path.exists(sitemap_path):
        try:
            slug_by_squash = salaryswish.parse_sitemap_slugs(sitemap_path)
        except RuntimeError as e:
            print(f'  WARNING  salaryswish sitemap unusable ({e}) — falling back to slugify() for all players')
    else:
        print('  WARNING  no salaryswish sitemap snapshot — falling back to slugify() for all players')

    new_cache = {}
    unresolved = []
    fetch_failed = []
    fetched = reused = 0
    for p in players:
        key = _base(p['name'])
        team = p['team']
        cached = cache.get(key)
        if cached and cached.get('team') == team:
            new_cache[key] = cached
            reused += 1
            continue
        squashed = salaryswish.squash(p['name'])
        squashed = salaryswish.NAME_ALIASES.get(squashed, squashed)
        slug = slug_by_squash.get(squashed) or salaryswish.slugify(p['name'])
        path = os.path.join(SALARYSWISH_PLAYERS_RAW, f'{slug}.html')
        if offline:
            if not os.path.exists(path):
                unresolved.append({'name': p['name'], 'team': team, 'reason': 'no offline snapshot'})
                continue
        else:
            if not salaryswish.fetch_page(salaryswish.PLAYER_URL.format(slug=slug), path):
                unresolved.append({'name': p['name'], 'team': team, 'reason': 'fetch failed'})
                fetch_failed.append(p['name'])
                continue
            fetched += 1
            time.sleep(SS_FETCH_DELAY)
        try:
            parsed = salaryswish.parse_player(path, team, min_season=CURRENT_SEASON_LABEL)
        except Exception as e:
            unresolved.append({'name': p['name'], 'team': team, 'reason': f'parse error: {e}'})
            continue
        if parsed is None:
            unresolved.append({'name': p['name'], 'team': team, 'reason': 'no matching contract block on page'})
            continue
        new_cache[key] = {'team': team, **parsed}

    json.dump(new_cache, open(SS_PLAYER_CACHE, 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved, open(os.path.join(OUT, 'unresolved-signing.json'), 'w'), indent=1, ensure_ascii=False)
    PAGE_GROUPS['salaryswish-players'] = {'total': fetched + len(fetch_failed), 'failed': sorted(fetch_failed)}
    print(f'  signing/incentives: {reused} reused from cache, {fetched} freshly fetched, '
          f'{len(unresolved)} unresolved')

    details = _load_json('contract-details', [])
    by_name = {r['name']: r for r in details}
    for p in players:
        entry = new_cache.get(_base(p['name']))
        if entry is None:
            continue
        rec = by_name.setdefault(p['name'], {'name': p['name']})
        if entry.get('signedUnder'):
            rec['signedUnder'] = entry['signedUnder']
        if entry.get('incentives'):
            rec['incentives'] = entry['incentives']

    # Backfill signedUnder from team-cap-state.json's exceptionsUsed for
    # anyone the per-player page left unclassified. classify_signing_method()
    # is deliberately conservative (a bare "Mid-Level Exception" without a
    # Non-Taxpayer/Taxpayer/Room qualifier maps to None rather than guessing —
    # see salaryswish.py), so real MLE/BAE signings routinely come back with
    # no signedUnder from the per-player scrape even though SalarySwish's
    # /mid-level-exception and /bi-annual-exception trackers (parsed earlier
    # this run by build_salaryswish_league, into team-cap-state.json) already
    # know the exact tier. Matching is name-based (_base(), same normalizer
    # used for the player-cache key above) since the tracker's player text
    # isn't guaranteed to match our display name byte-for-byte.
    base_to_name = {_base(p['name']): p['name'] for p in players}
    cap_state = _load_json('team-cap-state', [])
    exception_by_base = {}
    for r in cap_state:
        if r.get('season') != CURRENT_SEASON_LABEL:
            continue
        exceptions_used = r.get('exceptionsUsed') or {}
        for key, exception_id in (
            ('nonTaxpayerMLE', 'non-taxpayer-mle'),
            ('taxpayerMLE', 'taxpayer-mle'),
            ('roomMLE', 'room-mle'),
            ('biAnnual', 'bi-annual'),
        ):
            pool = exceptions_used.get(key)
            if not pool:
                continue
            for signing in pool.get('signings', []):
                exception_by_base[_base(signing['player'])] = exception_id
    backfilled = 0
    for base, exception_id in exception_by_base.items():
        name = base_to_name.get(base)
        if name is None:
            continue
        rec = by_name.setdefault(name, {'name': name})
        if not rec.get('signedUnder'):
            rec['signedUnder'] = exception_id
            backfilled += 1

    json.dump(list(by_name.values()), open(os.path.join(OUT, 'contract-details.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  signedUnder backfilled from exceptionsUsed trackers: {backfilled}')


def build_cash_ledger():
    """Hoops Rumors' annual "Cash Sent, Received In NBA Trades" post ->
    team-cap-state.json's CURRENT-season entries only (a running balance for
    this league year, not something future seasons have a value for).
    Requires team-cap-state.json to already exist (build_cap_state runs
    first). Same dated-URL-bumped-each-season caveat as the other four
    Hoops Rumors sources — see HR_CASH_IN_TRADE_URL above."""
    records = _load_json('team-cap-state', None)
    if records is None:
        raise RuntimeError('team-cap-state.json does not exist yet — run cap-state first')
    rows = hoopsrumors.parse_cash_in_trade(os.path.join(RAW, 'hr_cash_in_trade.html'))
    by_team = {}
    for r in rows:
        abbr = hoopsrumors.HR_TEAM_NAME_TO_ABBR.get(r['team'])
        if abbr is None:
            continue
        entry = {}
        if 'availableToSend' in r:
            entry['availableToSend'] = r['availableToSend']
        if 'availableToReceive' in r:
            entry['availableToReceive'] = r['availableToReceive']
        by_team[abbr] = entry
    matched = 0
    for r in records:
        if r['season'] != CURRENT_SEASON_LABEL:
            continue
        if r['team'] in by_team:
            r['cashLedger'] = by_team[r['team']]
            matched += 1
    json.dump(records, open(os.path.join(OUT, 'team-cap-state.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  cash-in-trade ledger: {matched} teams')


def build_apron_addon():
    """Approximates TeamCapSeason.apronAddon as the sum, per team-season, of
    each roster player's scraped unlikely-incentive dollars (from
    build_signing_incentives, which must run first — this reads its output
    off contract-details.json). Unlikely incentives are the field's own
    definition of the dominant reason Apron Team Salary != a team's raw cap
    hit — confirmed directly against SalarySwish's own "1st/2nd Apron Room"
    tooltips, which define apron room as "the apron minus the cap hit minus
    unlikely incentives", i.e. this literally is their addon. Smaller
    cap-hold/rookie-minimum true-ups that can also fold into the real Apron
    Team Salary aren't sourced anywhere, so this is a close lower bound, not
    the exact figure — do not present it as authoritative to the dollar."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')
    details = _load_json('contract-details', None)
    if details is None:
        raise RuntimeError('contract-details.json does not exist yet — run clauses/signing-incentives first')
    records = _load_json('team-cap-state', None)
    if records is None:
        raise RuntimeError('team-cap-state.json does not exist yet — run cap-state first')

    team_by_name = {p['name']: p['team'] for p in players}
    addon_by_key = {}
    seen_keys = set()
    for r in details:
        team = team_by_name.get(r['name'])
        if team is None:
            continue
        for season, amounts in (r.get('incentives') or {}).items():
            key = (team, season)
            seen_keys.add(key)
            addon_by_key[key] = addon_by_key.get(key, 0) + (amounts.get('unlikely') or 0)

    matched = 0
    for r in records:
        key = (r['team'], r['season'])
        if key in seen_keys:
            r['apronAddon'] = addon_by_key.get(key, 0)
            matched += 1
    json.dump(records, open(os.path.join(OUT, 'team-cap-state.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  apron addon (sum of unlikely incentives): {matched} team-season rows')


# Each group is independent: a fetch or parse failure in one skips only that
# group's output, leaving its last-committed snapshots/scraped/*.json in
# place, and never blocks the others. The run only fails hard if every group
# fails.
GROUPS = [
    # players' roster pages (salaryswish-rosters) fetch in their own loop —
    # see build_players — so the only fetch_all-covered SOURCES this group's
    # ok/skip check depends on are the draft-class pages.
    {'name': 'players', 'sources': [*[f'bbref_draft_{y}' for y in DRAFT_YEARS]],
     'build': build_players},
    {'name': 'free-agent-pool', 'sources': ['realgm_current_free_agents'],
     'build': build_free_agent_pool},
    {'name': 'picks', 'sources': ['realgm_future_drafts'], 'build': build_picks},
    {'name': 'enrichment', 'sources': ['hr_guarantee_dates', 'hr_non_guaranteed'],
     'build': build_enrichment},
    {'name': 'clauses', 'sources': ['hr_trade_kickers', 'hr_veto_trades'], 'build': build_clauses},
    {'name': 'player-awards', 'sources': [f'bbref_awards_{y}' for y in AWARDS_YEARS],
     'build': build_player_awards},
]


def main():
    offline = '--offline' in sys.argv
    rescue = set()
    for arg in sys.argv:
        if arg.startswith('--rescue='):
            rescue = {n for n in arg.split('=', 1)[1].split(',') if n}
    unknown_rescue = rescue - set(SOURCES)
    if unknown_rescue:
        sys.exit(f'--rescue: unknown source(s): {", ".join(sorted(unknown_rescue))}')
    os.makedirs(OUT, exist_ok=True)

    # Snapshot unresolved-*.json counts before this run touches anything, so
    # we can tell afterward whether NEW unmatched entries appeared (a real
    # regression) versus the same steady-state undrafted/unmatched players
    # every run carries forward.
    unresolved_before = count_unresolved()
    unresolved_records_before = snapshot_unresolved_records()

    print('fetch:')
    failed = fetch_all(offline, rescue, rescue_strict=bool(rescue))

    print('parse:')
    written = []
    skipped = []

    for group in GROUPS:
        ok = not (set(group['sources']) & failed)
        if group['name'] in ('free-agent-pool', 'enrichment'):
            # _cached_source() falls back to the last committed cache of
            # this group's page(s) when today's fetch fails, so neither of
            # these needs to skip on a fetch failure anymore — only an
            # actual build() exception (below) still counts as a failure.
            # enrichment is the only step that re-merges acquisitionHistory
            # (from ACQUISITION_HISTORY_LEDGER, always available regardless
            # of today's fetches) and guarantees onto players.json, so
            # skipping it whenever hr_guarantee_dates/hr_non_guaranteed
            # weren't fetched today — e.g. a --rescue scoped to an unrelated
            # source, run after build_players' own sources happened to
            # already be fetched today — silently stripped those fields from
            # every player. Confirmed live 2026-08-18: exactly this sequence
            # wiped acquisitionHistory from all 525 players and tripped
            # generate-from-scrape.js's diff-too-large guard.
            ok = True
        if not ok:
            skipped.append(f'{group["name"]} (fetch failed)')
            print(f'  SKIP {group["name"]} — fetch failed; keeping last-good output')
            continue
        try:
            group['build']()
            written.append(group['name'])
        except Exception as e:
            skipped.append(f'{group["name"]} (parse failed: {e})')
            print(f'  SKIP {group["name"]} — parse error: {e}\n       keeping last-good output')

    print('cap-state (nbacaptracker, separate multi-page source with its own fetch loop):')
    if rescue:
        skipped.append('cap-state (not covered by --rescue)')
        print('  SKIP cap-state — not one of the sources named in --rescue; keeping last-good output')
    else:
        try:
            build_cap_state(offline=offline)
            written.append('cap-state')
        except Exception as e:
            skipped.append(f'cap-state ({e})')
            print(f'  SKIP cap-state — {e}\n       keeping last-good output')

    print('cap-hold reconciliation (RealGM current free agents — merges onto team-cap-state.json):')
    # _cached_source() inside build_cap_hold_reconciliation() falls back to
    # the last committed cache when today's fetch fails, so — like
    # free-agent-pool above — this no longer needs to skip on a fetch
    # failure, only on an actual build exception.
    try:
        build_cap_hold_reconciliation()
        written.append('cap-hold-reconciliation')
    except Exception as e:
        skipped.append(f'cap-hold-reconciliation ({e})')
        print(f'  SKIP cap-hold-reconciliation — {e}\n       keeping last-good output')

    print('salaryswish-league (held TPEs, hard-cap status — merges onto team-cap-state.json):')
    if {'salaryswish_trade_exceptions', 'salaryswish_hard_cap'} & failed:
        skipped.append('salaryswish-league (fetch failed)')
        print('  SKIP salaryswish-league — fetch failed; keeping last-good output')
    else:
        try:
            build_salaryswish_league()
            written.append('salaryswish-league')
        except Exception as e:
            skipped.append(f'salaryswish-league ({e})')
            print(f'  SKIP salaryswish-league — {e}\n       keeping last-good output')

    print('salaryswish player detail (signing method, incentives — one fetch per new/changed player):')
    if rescue and 'clauses' not in written:
        skipped.append('signing-incentives (not covered by --rescue)')
        print('  SKIP signing-incentives — not one of the sources named in --rescue; keeping last-good output')
    else:
        # Even outside the sources named in --rescue, this must still run
        # whenever 'clauses' ran this cycle: build_clauses() overwrites
        # contract-details.json from scratch with just that run's raw
        # trade-kicker/no-trade-clause records, and build_signing_incentives
        # is what merges signedUnder/incentives back onto it — skipping it
        # would leave contract-details.json regressed to a bare subset of
        # itself. Confirmed live 2026-08-14: clauses' sources (hr_trade_kickers/
        # hr_veto_trades) happened to already be fetched today during a
        # realgm_current_free_agents rescue, clauses ran and collapsed
        # contract-details.json from 519 fully-merged records to 33 bare
        # ones, and validate-and-diff's oversized-diff guard correctly
        # refused to write it — but the underlying cause was this skip.
        try:
            build_signing_incentives(offline=offline)
            written.append('signing-incentives')
        except Exception as e:
            skipped.append(f'signing-incentives ({e})')
            print(f'  SKIP signing-incentives — {e}\n       keeping last-good output')

    print('cash-in-trade ledger (Hoops Rumors — merges onto team-cap-state.json):')
    if 'hr_cash_in_trade' in failed:
        skipped.append('cash-ledger (fetch failed)')
        print('  SKIP cash-ledger — fetch failed; keeping last-good output')
    else:
        try:
            build_cash_ledger()
            written.append('cash-ledger')
        except Exception as e:
            skipped.append(f'cash-ledger ({e})')
            print(f'  SKIP cash-ledger — {e}\n       keeping last-good output')

    print('apron addon (derived from signing-incentives\' unlikely-incentive sums):')
    if rescue and 'signing-incentives' not in written:
        skipped.append('apron-addon (not covered by --rescue)')
        print('  SKIP apron-addon — signing-incentives didn\'t run this rescue; keeping last-good output')
    else:
        try:
            build_apron_addon()
            written.append('apron-addon')
        except Exception as e:
            skipped.append(f'apron-addon ({e})')
            print(f'  SKIP apron-addon — {e}\n       keeping last-good output')

    unresolved_after = count_unresolved()
    new_unresolved = {
        label: max(0, unresolved_after[label] - unresolved_before.get(label, 0))
        for label in UNRESOLVED_FILES
    }

    source_fetches = {name: name not in failed for name in SOURCES}

    if rescue:
        # A rescue run only ever *attempts* the named source(s) — every other
        # group is intentionally skipped (see rescue_strict above), not
        # actually failed. Overwriting the full written/staleSources/
        # sourceFetches record with that would make a routine one-source
        # rescue look like the whole pipeline just went down (confirmed
        # live 2026-08-13: a single failed RealGM refetch turned "13 groups
        # written, everything healthy" into "0 groups written, every source
        # failed" on the dashboard). Merge this run's real outcome for the
        # rescued group(s) into the previous run-status.json instead of
        # replacing it, so untouched groups keep reporting what they
        # actually did last time.
        prev = _load_json('run-status', {}) or {}
        rescued_groups = {g['name'] for g in GROUPS if set(g['sources']) & rescue}
        if 'realgm_current_free_agents' in rescue:
            rescued_groups.add('cap-hold-reconciliation')
        if {'salaryswish_trade_exceptions', 'salaryswish_hard_cap'} & rescue:
            rescued_groups.add('salaryswish-league')
        if 'hr_cash_in_trade' in rescue:
            rescued_groups.add('cash-ledger')
        # cap-state, signing-incentives, apron-addon have no single-URL
        # source of their own to rescue against — never touched by --rescue.

        all_group_names = [g['name'] for g in GROUPS] + [
            'cap-state', 'cap-hold-reconciliation', 'salaryswish-league', 'signing-incentives',
            'cash-ledger', 'apron-addon',
        ]
        prev_written = set(prev.get('written', []))
        merged_written, merged_stale = [], []
        for name in all_group_names:
            if name in rescued_groups:
                if name in written:
                    merged_written.append(name)
                else:
                    merged_stale.append(next((s for s in skipped if s.startswith(name)), f'{name} (fetch failed)'))
            elif name in prev_written:
                merged_written.append(name)
            else:
                prev_entry = next((s for s in prev.get('staleSources', []) if s.startswith(name)), None)
                if prev_entry:
                    merged_stale.append(prev_entry)
        written, skipped = merged_written, merged_stale
        source_fetches = {**(prev.get('sourceFetches') or {}), **{n: v for n, v in source_fetches.items() if n in rescue}}

        # Track which currently-good sources got that way via a rescue click
        # rather than this morning's scheduled run, so the dashboard can show
        # "rescued" instead of "scraped" for them. Carry forward anything
        # still marked rescued from a prior rescue, add this run's successes,
        # and drop anything that failed again.
        rescued_sources = sorted(
            (set(prev.get('rescuedSources') or []) | {n for n in rescue if source_fetches.get(n)})
            & {n for n, v in source_fetches.items() if v}
        )
        # None of the per-team/per-player page-loop sources are individually
        # rescuable (no runPyKey), so a rescue run never touches PAGE_GROUPS —
        # carry the previous run's counts forward rather than reporting them
        # as "no data".
        page_groups = {**(prev.get('pageGroups') or {}), **PAGE_GROUPS}
    else:
        # A full scheduled run re-fetches everything itself, so nothing is
        # still running on a rescued value afterward.
        rescued_sources = []
        page_groups = PAGE_GROUPS

    status = {
        'written': written,
        'staleSources': skipped,
        'sourceFetches': source_fetches,
        'pageGroups': page_groups,
        'rescuedSources': rescued_sources,
        'unresolved': {
            'before': unresolved_before,
            'after': unresolved_after,
            'newUnresolved': sum(new_unresolved.values()),
            'newByCategory': {k: v for k, v in new_unresolved.items() if v > 0},
            'newRecords': new_unresolved_records(unresolved_records_before, snapshot_unresolved_records()),
        },
    }
    json.dump(status, open(os.path.join(OUT, 'run-status.json'), 'w'), indent=1, ensure_ascii=False)

    if not written:
        print('\nERROR: every group failed this run — nothing to update.')
        sys.exit(1)

    if skipped:
        print('\nWARN: partial run. Updated: ' + ', '.join(written) + '.')
        print('WARN: skipped: ' + '; '.join(skipped) + '.')
        print('WARN: the generator diffs only groups that updated, so the PR '
              '(if any) will not touch the skipped data.')

    if status['unresolved']['newUnresolved']:
        print(f'\nWARN: {status["unresolved"]["newUnresolved"]} new unresolved entries this run: '
              f'{status["unresolved"]["newByCategory"]}')


if __name__ == '__main__':
    main()
