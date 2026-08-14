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
  players             BBRef contracts + draft classes             -> players.json, rookie-years.json, unresolved-draft-year.json
  two-way-contracts   Hoops Rumors two-way tracker                -> merged onto players.json (team, contractType, salary; creates a new row if none exists)
                      (falls back to hr-two-way-tracker.json, a last-good copy committed to
                       snapshots/scraped/, on a fetch failure — see _cached_source — rather than
                       skipping and dropping every two-way row it previously created)
  free-agent-reconciliation  RealGM free-agent-options +          -> corrects stale CURRENT_SEASON_LABEL option
                      current-free-agents pages                      flags directly on players.json (no new file)
                      (falls back to realgm-free-agent-options.json / realgm-current-free-agents.json,
                       last-good copies committed to snapshots/scraped/, on a fetch failure — see
                       _cached_source — rather than skipping and letting stale flags reappear)
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

import bbref, realgm, hoopsrumors, captracker, salaryswish

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'snapshots', 'raw')
CAPTRACKER_RAW = os.path.join(RAW, 'nbacaptracker')
SS_TEAM_TRANSACTIONS_RAW = os.path.join(RAW, 'salaryswish_transactions')
SALARYSWISH_PLAYERS_RAW = os.path.join(RAW, 'salaryswish_players')
BBREF_PLAYERS_RAW = os.path.join(RAW, 'bbref_players')
OUT = os.path.join(ROOT, 'snapshots', 'scraped')
ROOKIE_YEARS_TS = os.path.join(ROOT, 'lib', 'rookie-years.ts')
SS_PLAYER_CACHE = os.path.join(OUT, 'salaryswish-players.json')
ACQUISITION_LEDGER = os.path.join(OUT, 'acquisition-ledger.json')
SS_FETCH_DELAY = 1.2  # polite delay between per-player fetches — see salaryswish.py's module docstring

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'
CURRENT_DRAFT_YEAR = 2026          # bump each June after the draft
DRAFT_YEARS = [CURRENT_DRAFT_YEAR, CURRENT_DRAFT_YEAR - 1]
CURRENT_SEASON_YEAR = 2026         # calendar year the current season starts — bump each July
CURRENT_SEASON_LABEL = f'{CURRENT_SEASON_YEAR}-{str(CURRENT_SEASON_YEAR + 1)[-2:]}'  # e.g. '2026-27'

# UPDATE THESE EACH SEASON — see the module docstring note above.
HR_GUARANTEE_DATES_URL = 'https://www.hoopsrumors.com/2026/05/early-nba-salary-guarantee-dates-for-2026-27.html'
HR_NON_GUARANTEED_URL = 'https://www.hoopsrumors.com/2026/07/2026-27-non-guaranteed-contracts-by-team.html'
HR_TRADE_KICKERS_URL = 'https://www.hoopsrumors.com/2025/08/nba-players-with-trade-kickers-in-2025-26.html'   # STALE — 2026/27 not yet published as of last update
HR_VETO_TRADES_URL = 'https://www.hoopsrumors.com/2025/07/nba-players-who-can-veto-trades-in-2025-26.html'    # STALE — 2026/27 not yet published as of last update
HR_CASH_IN_TRADE_URL = 'https://www.hoopsrumors.com/2025/08/cash-sent-received-in-nba-trades-for-2025-26.html'  # STALE — 2026/27 not yet published as of last update
# Evergreen post HR keeps updated in place all season (confirmed live: an
# "Updated 8-7-26" stamp near the top) — unlike the three above, this one
# does NOT need a yearly URL bump.
HR_TWO_WAY_TRACKER_URL = 'https://www.hoopsrumors.com/2026/07/2026-27-nba-two-way-contract-tracker.html'

# Flat, league-wide two-way salary per season — not individually negotiated,
# so unlike every other salary figure in this pipeline there's no per-player
# number to source. HR's tracker states the current season's figure in its
# own intro; spot-check there when bumping the season.
TWO_WAY_SALARY = {
    '2026-27': 678_882,
}

# Trades SalarySwish (or another source) has reported but that have NOT
# actually been executed — e.g. agreed-to-in-principle deals later put on
# hold. Every transaction matching (name, date) here is dropped before it
# ever reaches acquisition matching or build_free_agent_reconciliation's
# team-mismatch logic, so the player(s) involved keep showing on their real,
# current team with their real salary instead of being moved (and, for
# build_free_agent_reconciliation specifically, having that season's salary
# wiped — see its docstring's 'signed elsewhere' branch) to a team they
# haven't actually joined. Remove an entry here once the trade is confirmed
# executed (or confirmed dead) so this stops silently overriding fresh data.
FROZEN_TRANSACTIONS = {
    # Kawhi Leonard (LAC) / Brandon Ingram + Gradey Dick (TOR) — reported
    # 2026-06-30, put on hold before closing; confirmed frozen as of 2026-08-10.
    ('Gradey Dick', '2026-06-30'),
    ('Brandon Ingram', '2026-06-30'),
    ('Kawhi Leonard', '2026-06-30'),
}

SOURCES = {
    'bbref_contracts': 'https://www.basketball-reference.com/contracts/players.html',
    'realgm_future_drafts': 'https://basketball.realgm.com/nba/draft/future_drafts/team',
    'realgm_free_agent_options': 'https://basketball.realgm.com/nba/free_agent_options',
    'realgm_current_free_agents': 'https://basketball.realgm.com/nba/current_free_agents',
    'hr_guarantee_dates': HR_GUARANTEE_DATES_URL,
    'hr_non_guaranteed': HR_NON_GUARANTEED_URL,
    'hr_trade_kickers': HR_TRADE_KICKERS_URL,
    'hr_veto_trades': HR_VETO_TRADES_URL,
    'hr_cash_in_trade': HR_CASH_IN_TRADE_URL,
    'hr_two_way_tracker': HR_TWO_WAY_TRACKER_URL,
    'salaryswish_trade_exceptions': salaryswish.TRADE_EXCEPTION_URL,
    'salaryswish_hard_cap': salaryswish.HARD_CAP_URL,
    'salaryswish_mle': salaryswish.MLE_URL,
    'salaryswish_bae': salaryswish.BAE_URL,
    'salaryswish_dpe': salaryswish.DPE_URL,
    'salaryswish_sitemap': salaryswish.SITEMAP_URL,
    **{f'bbref_draft_{y}': f'https://www.basketball-reference.com/draft/NBA_{y}.html' for y in DRAFT_YEARS},
}

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
    6-day-old local bbref_contracts.html for the 'players' group, silently
    reverting ~180 lines of since-committed roster changes it had no way of
    knowing about.

    The one exception: a raw file last written earlier *today* (by an
    earlier rescue this same session) is reused rather than marked
    unavailable. That's what lets a multi-source group — e.g.
    free-agent-reconciliation, which needs both realgm_free_agent_options
    and realgm_current_free_agents — complete once every source it needs has
    been fetched today, even across separate rescue clicks, without forcing
    every rescue to re-list every source the group depends on. Anything
    older than today still gets marked unavailable, so main()'s existing
    skip-and-keep-last-good-output logic still protects every group whose
    sources haven't actually been refreshed today."""
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
    the group depending on it was skipped outright, and build_players'
    always-fresh-from-BBRef rebuild re-admitted whatever stale state (or, for
    build_two_way_contracts, dropped whatever rows) a PRIOR successful run
    had already corrected/created. Confirmed live 2026-08-14: a single failed
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


def _base(name):
    n = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    n = n.lower().replace('.', '').replace("'", '').replace('-', ' ')
    return re.sub(r'\s+', ' ', re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', n)).strip()


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


def resolve_duplicate_bbrefIds(contracts):
    """bbref.parse_contracts() now preserves BOTH rows when the same player
    appears under two different teams (see its docstring — confirmed live
    2026-08-07: Lillard/Beal/Prosper each had a stale row and a correct one,
    the old id-only dedup silently kept whichever came first). Resolve each
    such pair here, cross-referenced against the acquisition ledger — an
    independent, already-corroborated source for "which team is this
    player actually on" — rather than guessing from row order. Falls back
    to keeping the first row (the old behavior) when the ledger has nothing
    for that player either; those are logged, not silently guessed."""
    ledger = _load_json('acquisition-ledger', {})
    by_bbrefId = {}
    for c in contracts:
        bbrefId = c.get('bbrefId')
        if bbrefId is not None:
            by_bbrefId.setdefault(bbrefId, []).append(c)

    resolved, unresolved = [], []
    out = []
    seen_ids = set()
    for c in contracts:
        bbrefId = c.get('bbrefId')
        if bbrefId is None:
            out.append(c)
            continue
        if bbrefId in seen_ids:
            continue
        seen_ids.add(bbrefId)
        dupes = by_bbrefId[bbrefId]
        if len(dupes) == 1:
            out.append(dupes[0])
            continue
        ledger_team = ledger.get(bbrefId, {}).get('team')
        match = next((d for d in dupes if d['team'] == ledger_team), None)
        if match is not None:
            out.append(match)
            resolved.append({'name': match['name'], 'kept': match['team'],
                              'dropped': [d['team'] for d in dupes if d is not match],
                              'via': 'acquisition-ledger'})
        else:
            out.append(dupes[0])
            unresolved.append({'name': dupes[0]['name'],
                                'teams': [d['team'] for d in dupes],
                                'kept': dupes[0]['team']})
    if resolved:
        print(f'  {len(resolved)} duplicate contract row(s) resolved via acquisition ledger:')
        for r in resolved:
            print(f'    {r["name"]}  kept {r["kept"]}, dropped {r["dropped"]}')
    if unresolved:
        print(f'  {len(unresolved)} duplicate contract row(s) UNRESOLVED — no ledger match, kept first seen:')
        for u in unresolved:
            print(f'    {u["name"]}  {u["teams"]} -> kept {u["kept"]}')
    json.dump(resolved + unresolved, open(os.path.join(OUT, 'duplicate-contracts.json'), 'w'),
              indent=1, ensure_ascii=False)
    return out


def build_players():
    """Parse the Basketball Reference half and write its three scraped files."""
    offline = '--offline' in sys.argv  # same flag main() reads; not worth threading through GROUPS' build() signature
    contracts = bbref.parse_contracts(os.path.join(RAW, 'bbref_contracts.html'))
    contracts = resolve_duplicate_bbrefIds(contracts)
    draft = []
    for y in DRAFT_YEARS:
        draft += bbref.parse_draft(os.path.join(RAW, f'bbref_draft_{y}.html'), y)
    print(f'  contracts {len(contracts)}   draftees {len(draft)}')

    by_id = {d['bbrefId']: d['draftYear'] for d in draft if d['bbrefId']}
    by_name = {_base(d['name']): d['draftYear'] for d in draft}
    known = existing_rookie_years()

    players, rookie_years, unresolved = [], {}, []
    for c in contracts:
        # bbrefId rides along in this intermediate file only, to give
        # build_enrichment an exact join key across a possibly-separate run —
        # generate-from-scrape.js strips it before it reaches player-data.ts
        # or the diff snapshot, since it isn't part of the app's Player model.
        players.append({'name': c['name'], 'team': c['team'],
                        'salary': c['salary'], 'options': c['options'],
                        'bbrefId': c['bbrefId']})
        year = by_id.get(c['bbrefId']) or by_name.get(_base(c['name'])) or known.get(_base(c['name']))
        if year:
            rookie_years[c['name']] = year
        else:
            unresolved.append(c)

    # Fallback for whatever the draft-class join still couldn't place:
    # DRAFT_YEARS only covers the last two draft classes (see its
    # definition), so anyone drafted earlier — or genuinely undrafted — is
    # invisible to that join no matter how many runs go by. Their own BBRef
    # bio page states rookie year directly (NBA Debut date, or "Experience:
    # Rookie" pre-debut), so fetch just this small residual list — one
    # fetch per still-unresolved player, not the whole roster — and resolve
    # from there. Once resolved, existing_rookie_years() makes it permanent
    # (lib/rookie-years.ts is consulted as `known` on every future run), so
    # this fallback only ever pays for genuinely new stragglers.
    still_unresolved = []
    if unresolved:
        os.makedirs(BBREF_PLAYERS_RAW, exist_ok=True)
        resolved_by_fallback = 0
        for c in unresolved:
            bbrefId = c.get('bbrefId')
            if not bbrefId:
                still_unresolved.append(c)
                continue
            path = os.path.join(BBREF_PLAYERS_RAW, f'{bbrefId}.html')
            if offline:
                if not os.path.exists(path):
                    still_unresolved.append(c)
                    continue
            else:
                url = bbref.PLAYER_URL.format(first=bbrefId[0], bbrefId=bbrefId)
                if not bbref.fetch_page(url, path):
                    still_unresolved.append(c)
                    continue
                time.sleep(1.0)
            year = bbref.parse_player_debut(path, CURRENT_SEASON_YEAR)
            if year:
                rookie_years[c['name']] = year
                resolved_by_fallback += 1
            else:
                still_unresolved.append(c)
        if resolved_by_fallback:
            print(f'  draft-year fallback (BBRef bio pages): resolved {resolved_by_fallback}, '
                  f'still unresolved {len(still_unresolved)}')
    unresolved = [{'name': c['name'], 'team': c['team']} for c in still_unresolved]

    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(rookie_years, open(os.path.join(OUT, 'rookie-years.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved, open(os.path.join(OUT, 'unresolved-draft-year.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  players {len(players)}   draft years {len(rookie_years)}   unresolved {len(unresolved)}')
    if unresolved:
        print('  (unresolved draft years are undrafted players — expected, not an error)')


def build_two_way_contracts():
    """Merges Hoops Rumors' two-way contract tracker onto players.json:
    corrects `team` and stamps `contractType: 'two-way'` + the flat two-way
    salary (TWO_WAY_SALARY) onto the matched row. Runs right after
    build_players and before build_free_agent_reconciliation specifically so
    a corrected team is what that reconciliation (and build_free_agent_pool
    after it) sees — a two-way signing BBRef hasn't caught up to yet is
    exactly the kind of staleness that made Jalen Pickett briefly look like
    a Denver free agent who'd declined his option, when he'd actually
    already agreed to a two-way deal with the Clippers.

    Two-way salary isn't individually negotiated (one flat league-wide
    number per season) — there's no real per-player figure to source beyond
    that constant, so stamping it on is the correct figure, not an estimate.
    This is also what stops the free-agent panel's "empty salary = still a
    free agent" heuristic from misreading an already-signed two-way player:
    once salary[CURRENT_SEASON_LABEL] is populated, that heuristic no longer
    fires for them. getEffectiveSalary (lib/roster-context.tsx) then
    excludes contractType='two-way' rows from Team Salary the same way it
    already does for two-way SavedContracts, so populating a real number
    here doesn't leak into cap totals.

    Matches primarily by bbrefId (exact); falls back to name only for a
    tracker entry with no bbrefId link. A tracker entry naming a player with
    NO players.json row at all — the common case: most two-way slots go to
    rookies/first-timers who've never had a BBRef contracts-page row —
    gets a brand-new minimal row created here (name, team, contractType,
    the flat salary, bbrefId as the join key for future runs), rather than
    being left invisible. This is a deliberate, narrow exception to the
    'never invent a row' boundary build_free_agent_reconciliation and
    build_free_agent_pool hold to: those two only ever correct/reference
    players BBRef already knows about, but a two-way slot is real roster
    occupancy this pipeline otherwise has no other way to represent at all.
    Confirmed live 2026-08-10: 73 of 74 tracker entries had no players.json
    row (e.g. Rockets two-way signees Tristen Newton, Quadir Copeland) —
    leaving them merely logged and invisible, as this function used to,
    defeated the point of sourcing this tracker in the first place."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')
    by_id = {p.get('bbrefId'): p for p in players if p.get('bbrefId')}
    by_name = {_base(p['name']): p for p in players}

    tracker = _cached_source('hr_two_way_tracker', 'hr-two-way-tracker', hoopsrumors.parse_two_way_tracker)
    salary = TWO_WAY_SALARY.get(CURRENT_SEASON_LABEL)

    matched = 0
    created = 0
    team_corrected = []
    for entry in tracker:
        target = (by_id.get(entry['bbrefId']) if entry['bbrefId'] else None) or by_name.get(_base(entry['name']))
        if target is None:
            target = {'name': entry['name'], 'team': entry['team'], 'salary': {}, 'options': {}}
            if entry['bbrefId']:
                target['bbrefId'] = entry['bbrefId']
            players.append(target)
            if entry['bbrefId']:
                by_id[entry['bbrefId']] = target
            by_name[_base(entry['name'])] = target
            created += 1
        elif target.get('team') != entry['team']:
            team_corrected.append({'name': target['name'], 'oldTeam': target.get('team'),
                                    'newTeam': entry['team'], 'reported': entry['reported']})
            target['team'] = entry['team']
        target['contractType'] = 'two-way'
        if salary is not None:
            target.setdefault('salary', {})[CURRENT_SEASON_LABEL] = salary
        matched += 1

    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  two-way tracker: {matched}/{len(tracker)} matched   {created} new players.json row(s) created')
    if team_corrected:
        print(f'  {len(team_corrected)} team correction(s):')
        for c in team_corrected:
            note = '  (reported, not yet official)' if c['reported'] else ''
            print(f'    {c["name"]}  {c["oldTeam"]} -> {c["newTeam"]}{note}')


def build_picks():
    """Parse the RealGM half and write its scraped file."""
    picks, pick_stats = realgm.parse_picks(os.path.join(RAW, 'realgm_future_drafts.html'))
    picks = [p for p in picks if p['year'] != CURRENT_DRAFT_YEAR]  # already converted to real players
    json.dump(picks, open(os.path.join(OUT, 'draft-picks.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  picks {len(picks)}   '
          f'(count-reconciled: {pick_stats["sections"] - pick_stats["unreconciled"]}/{pick_stats["sections"]} sections)')


def build_enrichment():
    """Merges acquisition (SalarySwish per-team transactions) and guarantees
    (Hoops Rumors) onto players.json. Requires players.json to already exist
    — either freshly written this run by build_players(), or last-good from
    a previous run — since this only enriches existing player records, never
    creates new ones. Unmatched entries are written to unresolved-*.json
    rather than dropped or treated as a hard failure, matching the
    unresolved-draft-year.json precedent already in this pipeline.

    Acquisition used to come from BBRef's season transactions page, with
    RealGM's transactions log as a supplementary fix for the gap while
    BBRef's new-season page didn't exist yet. Both were retired 2026-08-06
    in favor of this single SalarySwish source, which covers everything they
    did (signings, waivers, extensions) plus what neither did (trades,
    drafts) — see salaryswish.py's module docstring on TEAM_SLUG_TO_ABBR.
    Verified against real data before the retirement: this source correctly
    resolved acquisitions BBRef/RealGM either missed entirely or (worse) got
    actively wrong from a stale prior-season record — e.g. Deandre Ayton's
    2026-07-08 trade to Washington, previously invisible behind a stale
    2025-07-06 free-agent signing record.

    Fetch failure here (all 30 team pages) doesn't take down guarantees
    processing — it's not in the `enrichment` GROUPS entry's required
    sources, same as RealGM was before it."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')
    by_id = {p.get('bbrefId'): p for p in players if p.get('bbrefId')}
    by_name = {_base(p['name']): p for p in players}

    # --- acquisition (SalarySwish per-team transactions, backed by a
    # persisted ledger — see snapshots/scraped/acquisition-ledger.json) ---
    # SalarySwish's team pages only cover roughly the last few months
    # (confirmed live 2026-08-07: the Suns' page only reaches back to
    # 2026-03-24), so a player whose last real acquisition predates that
    # window has nothing to match here on any given day. Rebuilding
    # `players` from scratch every run and only ever setting `acquisition`
    # from *this run's* match (the pre-2026-08-07 behavior) silently blanked
    # every such player instead of carrying forward what we already knew —
    # this is what actually shipped in PR #49 and had to be corrected.
    #
    # The ledger fixes that: a persisted, git-committed store keyed by
    # player, tagged with the team the event was for. Every run, a fresh
    # SalarySwish match always overwrites the ledger (today's data is always
    # at least as current as anything already stored). No match today ->
    # fall back to the ledger, but ONLY if its stored team still matches the
    # player's CURRENT team (from this run's fresh BBRef contracts fetch).
    # That guard is the whole point: a ledger entry for a team the player
    # has since left is exactly the stale-data failure BBRef's old
    # season-transactions source had (see its docstring's Ayton example) —
    # showing nothing is strictly better than showing a confidently wrong
    # answer. scripts/scrape/backfill_acquisitions.py seeds the ledger for
    # players with no history in SalarySwish's window at all; that's a
    # manual, one-time/occasional script, not part of this daily run.
    ledger = _load_json('acquisition-ledger', {})

    ss_offline = '--offline' in sys.argv
    ss_failed_teams = salaryswish.fetch_team_transactions(SS_TEAM_TRANSACTIONS_RAW, offline=ss_offline)
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
    matched_acq = 0
    stale_cleared = []
    # A player can appear multiple times in a season's transaction log (waived
    # then re-signed, etc.) — keep the most recent by date as the "current"
    # acquisition, matching how the app treats acquisition as current-state.
    latest_by_player = {}
    for t in transactions:
        key = t.get('bbrefId') or _base(t['name'])
        prev = latest_by_player.get(key)
        if prev is None or (t['date'] or '') >= (prev['date'] or ''):
            latest_by_player[key] = t
    matched_today = set()
    for source_key, t in latest_by_player.items():
        target = by_id.get(t.get('bbrefId')) or by_name.get(_base(t['name']))
        if target is None:
            unresolved_acq.append({'name': t['name'], 'date': t['date'], 'method': t['method']})
            continue
        # Key the ledger off the RESOLVED player's own identity, not
        # whatever identifier this source record happened to carry.
        # SalarySwish's daily transactions never carry a bbrefId at all
        # (confirmed in salaryswish.py — always None), so without this a
        # player ends up with two separate ledger entries: one bbrefId-keyed
        # from the BBRef backfill, one name-keyed from today's SalarySwish
        # match — same person, two keys, and the carry-forward loop below
        # would treat the stale half as an unrelated "mismatch" forever.
        key = target.get('bbrefId') or _base(target['name'])
        if t['date']:
            # SalarySwish's own per-team page IS the team this transaction is
            # for (toTeams is always exactly [team_abbr] — see salaryswish.py's
            # parse_team_transactions), so the LEDGER is always safe to
            # overwrite with it. Applying it to the player record is a
            # separate decision, though: `team` comes from BBRef's contracts
            # page, a DIFFERENT daily-fetched source that can lag behind
            # SalarySwish by days on the very same run (confirmed live,
            # 2026-08-07: Kentavious Caldwell-Pope's SalarySwish page already
            # showed his Aug 5 signing to PHI while BBRef's contracts page
            # still had him under MEM at $21.6M) — showing team=MEM next to
            # acquisition="signed Aug 5" reads as "re-signed with Memphis",
            # which is false. Only surface it once both sources agree.
            ledger[key] = {'date': t['date'], 'method': t['method'], 'team': t['toTeams'][0]}
            if t['toTeams'][0] == target.get('team'):
                target['acquisition'] = {'date': t['date'], 'method': t['method']}
                matched_acq += 1
            else:
                stale_cleared.append({'name': target['name'], 'ledgerTeam': t['toTeams'][0],
                                       'currentTeam': target.get('team'), 'date': t['date'],
                                       'reason': 'bbref-contracts-lagging'})
            matched_today.add(key)
    # Carry forward from the ledger for anyone not matched this run, but only
    # while the ledger's team still agrees with today's actual team.
    for key, entry in ledger.items():
        if key in matched_today:
            continue
        target = by_id.get(key) or by_name.get(key)
        if target is None:
            continue
        if entry.get('team') == target.get('team'):
            target['acquisition'] = {'date': entry['date'], 'method': entry['method']}
        else:
            stale_cleared.append({'name': target['name'], 'ledgerTeam': entry.get('team'),
                                   'currentTeam': target.get('team'), 'date': entry['date'],
                                   'reason': 'no-new-match'})
    json.dump(ledger, open(ACQUISITION_LEDGER, 'w'), indent=1, ensure_ascii=False)
    if stale_cleared:
        print(f'  {len(stale_cleared)} entr{"y" if len(stale_cleared)==1 else "ies"} '
              f'team-mismatched — left blank, not shown:')
        for s in stale_cleared:
            print(f'    {s["name"]}  ledger={s["ledgerTeam"]}  current={s["currentTeam"]}  ({s["reason"]})')

    # --- guarantees (Hoops Rumors, two pages merged; exact-date page wins on conflict) ---
    exact = hoopsrumors.parse_guarantee_dates(os.path.join(RAW, 'hr_guarantee_dates.html'), CURRENT_SEASON_YEAR)
    team_wide = hoopsrumors.parse_non_guaranteed_by_team(os.path.join(RAW, 'hr_non_guaranteed.html'))
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
    print(f'  acquisition matched {matched_acq}/{len(latest_by_player)}   unresolved {len(unresolved_acq)}')
    have_acq = sum(1 for p in players if p.get('acquisition'))
    print(f'  acquisition coverage: {have_acq}/{len(players)} players ({len(players) - have_acq} blank)')
    print(f'  guarantees matched {matched_guar}   unresolved {len(unresolved_guar)}')


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


def build_free_agent_reconciliation():
    """Corrects stale CURRENT_SEASON_LABEL option flags on BBRef's contracts
    page (build_players' source). CURRENT_SEASON_LABEL only ever names a
    season after that season's option deadlines (~June 30) have already
    passed — the label itself doesn't bump to a season until July — so ANY
    player still carrying a Player or Team option flag for that season has
    already had the decision made one way or another; BBRef just hasn't
    caught up yet. RealGM's free_agent_options page confirms this indirectly:
    it only ever lists option years for seasons further out, because a
    same-season entry would mean a decision RealGM itself considers already
    resolved. Requires players.json to already exist (build_players runs
    first, same dependency pattern build_enrichment follows).

    Three resolutions now (was two before 2026-08-07):
      - declined, still unsigned: player shows up on RealGM's
        current_free_agents page with a matching prior team -> drop the
        player's row from `players` entirely, not just that season's salary
        + options. An unexercised option is the last year of the deal, so
        there's no valid contract left at all, on ANY team, for a season
        or any that follow — leaving a stripped-but-present row here was
        the bug behind Beal/Batum/Harden/Kuminga/Watford repeatedly
        showing up rostered with no contract (or someone else's stale
        contract, per resolve_duplicate_bbrefIds): build_free_agent_pool
        (next in GROUPS) only adds players who have NO players.json row,
        so a merely-stripped row silently excluded them from the free-agent
        pool forever instead of surfacing them there. Removing the row here
        is what lets build_free_agent_pool pick them up correctly.
      - declined, already signed elsewhere: player does NOT show up on
        current_free_agents (so at first glance looks "resolved in place"),
        but transactions.json — SalarySwish acquisition data, read straight
        off disk here rather than requiring build_enrichment to run first
        THIS execution (build_players always rebuilds `players` fresh from
        raw BBRef every run, which would just reset any same-run fix before
        this function's own correction could stick — reading yesterday's
        already-persisted transactions.json sidesteps that entirely, same
        "it'll catch up within a day" tradeoff the acquisition ledger
        already makes) — has a signing/trade record for them dated after
        their option decision, to a DIFFERENT team than BBRef's contracts
        page still shows. Confirmed live 2026-08-07: Kentavious
        Caldwell-Pope's Team option showed as "still on Memphis" because
        he'd already re-signed with Philadelphia fast enough to drop off
        RealGM's free-agent list before this ran — the old two-way logic
        misread that absence as "exercised in place" and kept his stale
        $21.6M Memphis salary. -> remove the stale salary + options, and
        correct `team` to match the transaction (the one field this
        function never used to touch at all).
      - resolved in place (exercised, or re-signed with the SAME team and
        just not reflected as a new option-free row yet): neither of the
        above -> BBRef's salary figure is presumably still correct, so only
        the stale options flag is cleared, salary and team are kept.

    free_agent_options (who had a pending option, of what type) is
    cross-referenced only for extra confidence in the logged record — it is
    never a requirement, since an unsigned free agent with a prior-team match
    is already strong enough evidence on its own."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')

    options = _cached_source('realgm_free_agent_options', 'realgm-free-agent-options',
                              realgm.parse_free_agent_options)
    free_agents = _cached_source('realgm_current_free_agents', 'realgm-current-free-agents',
                                  realgm.parse_current_free_agents)

    fa_by_name = {}
    for fa in free_agents:
        fa_by_name[_base(fa['name'])] = fa
    options_by_name_season = {}
    for o in options:
        options_by_name_season.setdefault((_base(o['name']), o['season']), []).append(o)

    # Most-recent-by-date SalarySwish transaction per player, written by
    # build_enrichment (which GROUPS now runs before this function).
    transactions = _load_json('transactions', [])
    latest_txn = {}
    for t in transactions:
        key = t.get('bbrefId') or _base(t['name'])
        prev = latest_txn.get(key)
        if prev is None or (t['date'] or '') >= (prev['date'] or ''):
            latest_txn[key] = t

    checked = 0
    declined_overrides = []
    signed_elsewhere = []
    resolved_in_place = []
    kept_players = []
    for p in players:
        season_option = p.get('options', {}).get(CURRENT_SEASON_LABEL)
        if season_option not in ('Player', 'Team'):
            kept_players.append(p)
            continue
        checked += 1

        matched_options = [o for o in options_by_name_season.get((_base(p['name']), CURRENT_SEASON_LABEL), [])
                            if o['team'] == p['team']]
        corroborated = bool(matched_options)

        fa = fa_by_name.get(_base(p['name']))
        txn = latest_txn.get(p.get('bbrefId')) or latest_txn.get(_base(p['name']))
        txn_team = txn['toTeams'][0] if txn and len(txn.get('toTeams', [])) == 1 else None

        if fa is not None and fa['priorTeam'] == p['team']:
            # declined and still unsigned — the whole row is dropped (not
            # just this season's salary/options): an unexercised option is
            # the last year of the deal, so there's no valid contract left
            # on any team, this season or later. Dropping the row is also
            # what lets build_free_agent_pool (next in GROUPS) add them to
            # the free-agent pool instead of skipping them as "already
            # accounted for".
            record = {'name': p['name'], 'team': p['team'], 'season': CURRENT_SEASON_LABEL,
                       'optionType': season_option, 'faType': fa['faType'],
                       'source': 'realgm_current_free_agents', 'corroborated': corroborated}
            if corroborated:
                record['matchedOptionType'] = matched_options[0]['optionType']
            declined_overrides.append(record)
        elif txn_team is not None and txn_team != p['team']:
            # not on RealGM's free-agent list, but a real transaction moved
            # them to a DIFFERENT team than BBRef still shows — they signed
            # elsewhere fast enough to drop off that list, not "in place".
            old_team, old_salary = p['team'], p.get('salary', {}).get(CURRENT_SEASON_LABEL)
            p['team'] = txn_team
            p.get('salary', {}).pop(CURRENT_SEASON_LABEL, None)
            p.get('options', {}).pop(CURRENT_SEASON_LABEL, None)
            signed_elsewhere.append({'name': p['name'], 'oldTeam': old_team, 'newTeam': txn_team,
                                      'oldSalary': old_salary, 'season': CURRENT_SEASON_LABEL,
                                      'txnDate': txn['date'], 'txnMethod': txn['method']})
            kept_players.append(p)
        else:
            # not an unsigned free agent under this team — treat as resolved
            # in place (exercised / already re-signed with the SAME team);
            # the flag is stale, the salary figure and team are not
            p.get('options', {}).pop(CURRENT_SEASON_LABEL, None)
            resolved_in_place.append({'name': p['name'], 'team': p['team'], 'season': CURRENT_SEASON_LABEL,
                                       'optionType': season_option, 'corroborated': corroborated})
            kept_players.append(p)

    players = kept_players

    if declined_overrides:
        print(f'  {len(declined_overrides)} player(s) declined their option and are still unsigned — '
              f'dropped from the roster entirely (now eligible for the free-agent pool):')
        for o in declined_overrides:
            print(f'    {o["name"]}  (was {o["team"]})')

    if signed_elsewhere:
        print(f'  {len(signed_elsewhere)} player(s) signed elsewhere before dropping off '
              f'the free-agent list — team + salary corrected:')
        for s in signed_elsewhere:
            print(f'    {s["name"]}  {s["oldTeam"]} -> {s["newTeam"]}  (was ${s["oldSalary"]})')

    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(declined_overrides, open(os.path.join(OUT, 'free-agent-overrides.json'), 'w'),
              indent=1, ensure_ascii=False)
    json.dump(signed_elsewhere, open(os.path.join(OUT, 'signed-elsewhere-overrides.json'), 'w'),
              indent=1, ensure_ascii=False)
    json.dump(resolved_in_place, open(os.path.join(OUT, 'exercised-options.json'), 'w'),
              indent=1, ensure_ascii=False)
    print(f'  stale {CURRENT_SEASON_LABEL} options checked: {checked}   '
          f'declined/unsigned: {len(declined_overrides)}   signed-elsewhere: {len(signed_elsewhere)}   '
          f'resolved-in-place (flag cleared): {len(resolved_in_place)}')
    for o in declined_overrides:
        print(f'    DECLINED  {o["name"]} ({o["team"]}, {o["season"]}) — corroborated={o["corroborated"]}')


def apply_persisted_free_agent_overrides():
    """Fallback for when build_free_agent_reconciliation can't run this cycle
    (RealGM fetch/parse failure): build_players always rebuilds `players`
    fresh from raw BBRef every run, which re-adds rows for players BBRef
    hasn't caught up on yet — including ones a PRIOR successful run already
    identified as declined-and-still-unsigned or signed-elsewhere, and wrote
    to free-agent-overrides.json / signed-elsewhere-overrides.json. GROUPS'
    "skip, keep last-good output" framing doesn't hold for this group: it has
    no output file of its own, it mutates players.json that build_players
    (an independent, earlier group) already overwrote THIS run. Skipping it
    silently un-does the drop/correction from every prior run instead of
    preserving it. Confirmed live 2026-08-13: Harden/Kuminga/Beal/Batum/
    Watford reappeared rostered on their old teams this way, despite already
    being recorded in free-agent-overrides.json from the last successful
    reconciliation. Reapplying those persisted files (left untouched by the
    skip) closes that gap without needing a live RealGM fetch."""
    players = _load_json('players', [])
    if not players:
        return

    declined = _load_json('free-agent-overrides', [])
    drop_keys = {(_base(o['name']), o['team']) for o in declined}
    kept = [p for p in players if (_base(p['name']), p['team']) not in drop_keys]
    dropped = len(players) - len(kept)

    signed_elsewhere = _load_json('signed-elsewhere-overrides', [])
    by_name = {_base(o['name']): o for o in signed_elsewhere}
    corrected = 0
    for p in kept:
        o = by_name.get(_base(p['name']))
        if o and p['team'] == o['oldTeam']:
            p['team'] = o['newTeam']
            p.get('salary', {}).pop(o['season'], None)
            p.get('options', {}).pop(o['season'], None)
            corrected += 1

    if not dropped and not corrected:
        return
    json.dump(kept, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  reapplied persisted free-agent overrides: {dropped} dropped, {corrected} team-corrected')
    for o in declined:
        if (_base(o['name']), o['team']) in drop_keys:
            print(f'    DROPPED  {o["name"]}  (was {o["team"]})')


def build_free_agent_pool():
    """Writes the full list of currently-unsigned free agents, sourced from
    the same RealGM current_free_agents page build_free_agent_reconciliation
    reads. Different job, same source: that function only patches stale
    entries on players who already have a row in players.json (from BBRef);
    this one covers the players who have NO row there at all, because no
    team currently employs them — e.g. Lonzo Ball, Ochai Agbaji. Confirmed
    2026-08-07: only 8 of 152 current free agents had any players.json row.

    RealGM's own page can lag a real signing by days (confirmed live
    2026-08-10: Jalen Pickett still listed as a Denver free agent here
    several days after signing a two-way deal with the Clippers — a real
    transaction players.json/build_players already has via BBRef+the
    acquisition ledger). Anyone who already has a players.json row is
    excluded here even if RealGM still lists them: that row means the app
    already accounts for them one way or another (signed with a salary, or
    corrected by build_free_agent_reconciliation), so re-adding a
    stale/wrong prior team from this pool would just contradict it.
    {name, priorTeam, faType, birdRights} — same fields, kept as raw as the
    parser returns them (faType 'U'/'R' interpreted downstream, not here)."""
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
    this is the same class of staleness build_free_agent_reconciliation
    already corrects for option flags, applied to capHolds instead.

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
    {'name': 'players', 'sources': ['bbref_contracts', *[f'bbref_draft_{y}' for y in DRAFT_YEARS]],
     'build': build_players},
    {'name': 'two-way-contracts', 'sources': ['hr_two_way_tracker'], 'build': build_two_way_contracts},
    {'name': 'free-agent-reconciliation',
     'sources': ['realgm_free_agent_options', 'realgm_current_free_agents'],
     'build': build_free_agent_reconciliation},
    {'name': 'free-agent-pool', 'sources': ['realgm_current_free_agents'],
     'build': build_free_agent_pool},
    {'name': 'picks', 'sources': ['realgm_future_drafts'], 'build': build_picks},
    {'name': 'enrichment', 'sources': ['hr_guarantee_dates', 'hr_non_guaranteed'],
     'build': build_enrichment},
    {'name': 'clauses', 'sources': ['hr_trade_kickers', 'hr_veto_trades'], 'build': build_clauses},
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
        if group['name'] in ('two-way-contracts', 'free-agent-reconciliation', 'free-agent-pool'):
            # _cached_source() falls back to the last committed cache of
            # this group's page(s) when today's fetch fails, so none of these
            # need to skip on a fetch failure anymore — only an actual
            # build() exception (below) still counts as a failure. Without
            # this, two-way-contracts skipping on a failed hr_two_way_tracker
            # fetch would silently drop every two-way player it created
            # (most of them have no BBRef contracts-page row at all — see
            # build_two_way_contracts) the moment build_players rebuilds
            # players.json fresh next.
            ok = True
        if not ok:
            skipped.append(f'{group["name"]} (fetch failed)')
            print(f'  SKIP {group["name"]} — fetch failed; keeping last-good output')
            if group['name'] == 'free-agent-reconciliation':
                apply_persisted_free_agent_overrides()
            continue
        try:
            group['build']()
            written.append(group['name'])
        except Exception as e:
            skipped.append(f'{group["name"]} (parse failed: {e})')
            print(f'  SKIP {group["name"]} — parse error: {e}\n       keeping last-good output')
            if group['name'] == 'free-agent-reconciliation':
                apply_persisted_free_agent_overrides()

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
    # free-agent-reconciliation/free-agent-pool above — this no longer
    # needs to skip on a fetch failure, only on an actual build exception.
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
    else:
        # A full scheduled run re-fetches everything itself, so nothing is
        # still running on a rescued value afterward.
        rescued_sources = []

    status = {
        'written': written,
        'staleSources': skipped,
        'sourceFetches': source_fetches,
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
