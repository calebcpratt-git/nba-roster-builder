"""Fetch -> parse -> normalize. Writes JSON for the Node generators to consume.

Usage:  python scripts/scrape/run.py [--offline]
  --offline   reuse snapshots/raw/*.html instead of hitting the network

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
  picks               RealGM future drafts                        -> draft-picks.json
  enrichment          BBRef transactions + HR guarantee data       -> merged onto players.json (acquisition, guarantees)
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
season-specific URLs, not stable endpoints. HR_TRADE_KICKERS_URL and
HR_VETO_TRADES_URL below are still pointing at the 2025/26 articles because,
as of this pipeline's last update (July 2026), Hoops Rumors had not yet
published the 2026/27 versions (they typically go up in August). Records
pulled from a still-current older-season article are still correct for
"who currently has a trade kicker" purposes but check for the 2026/27
version each time you re-run this and update the URL when it exists —
search "hoopsrumors nba players with trade kickers 2026/27" and
"hoopsrumors nba players who can veto trades 2026/27".
"""
import json, os, re, sys, time, random, unicodedata, urllib.request, urllib.error

import bbref, realgm, hoopsrumors, captracker, salaryswish

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'snapshots', 'raw')
CAPTRACKER_RAW = os.path.join(RAW, 'nbacaptracker')
SALARYSWISH_PLAYERS_RAW = os.path.join(RAW, 'salaryswish_players')
OUT = os.path.join(ROOT, 'snapshots', 'scraped')
ROOKIE_YEARS_TS = os.path.join(ROOT, 'lib', 'rookie-years.ts')
SS_PLAYER_CACHE = os.path.join(OUT, 'salaryswish-players.json')
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

SOURCES = {
    'bbref_contracts': 'https://www.basketball-reference.com/contracts/players.html',
    'realgm_future_drafts': 'https://basketball.realgm.com/nba/draft/future_drafts/team',
    'bbref_transactions': f'https://www.basketball-reference.com/leagues/NBA_{CURRENT_DRAFT_YEAR}_transactions.html',
    'hr_guarantee_dates': HR_GUARANTEE_DATES_URL,
    'hr_non_guaranteed': HR_NON_GUARANTEED_URL,
    'hr_trade_kickers': HR_TRADE_KICKERS_URL,
    'hr_veto_trades': HR_VETO_TRADES_URL,
    'hr_cash_in_trade': HR_CASH_IN_TRADE_URL,
    'salaryswish_trade_exceptions': salaryswish.TRADE_EXCEPTION_URL,
    'salaryswish_hard_cap': salaryswish.HARD_CAP_URL,
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
            req = urllib.request.Request(
                url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'})
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


def fetch_all(offline=False):
    """Fetch every single-URL source. Never raises for a single source;
    returns the set of source names that could not be obtained this run."""
    os.makedirs(RAW, exist_ok=True)
    failed = set()
    for name, url in SOURCES.items():
        path = os.path.join(RAW, f'{name}.html')
        if offline:
            if os.path.exists(path):
                print(f'  offline  {name}')
            else:
                print(f'  MISSING  {name}  (no snapshot; --offline)')
                failed.add(name)
            continue
        if not fetch_one(name, url):
            failed.add(name)
        time.sleep(4)          # be a polite guest between sources
    return failed


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


def build_players():
    """Parse the Basketball Reference half and write its three scraped files."""
    contracts = bbref.parse_contracts(os.path.join(RAW, 'bbref_contracts.html'))
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
            unresolved.append({'name': c['name'], 'team': c['team']})

    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(rookie_years, open(os.path.join(OUT, 'rookie-years.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved, open(os.path.join(OUT, 'unresolved-draft-year.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  players {len(players)}   draft years {len(rookie_years)}   unresolved {len(unresolved)}')
    if unresolved:
        print('  (unresolved draft years are undrafted players — expected, not an error)')


def build_picks():
    """Parse the RealGM half and write its scraped file."""
    picks, pick_stats = realgm.parse_picks(os.path.join(RAW, 'realgm_future_drafts.html'))
    picks = [p for p in picks if p['year'] != CURRENT_DRAFT_YEAR]  # already converted to real players
    json.dump(picks, open(os.path.join(OUT, 'draft-picks.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  picks {len(picks)}   '
          f'(count-reconciled: {pick_stats["sections"] - pick_stats["unreconciled"]}/{pick_stats["sections"]} sections)')


def build_enrichment():
    """Merges acquisition (BBRef transactions) and guarantees (Hoops Rumors)
    onto players.json. Requires players.json to already exist — either freshly
    written this run by build_players(), or last-good from a previous run —
    since this only enriches existing player records, never creates new ones.
    Unmatched entries are written to unresolved-*.json rather than dropped or
    treated as a hard failure, matching the unresolved-draft-year.json
    precedent already in this pipeline."""
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist yet — run the players group first')
    by_id = {p.get('bbrefId'): p for p in players if p.get('bbrefId')}
    by_name = {_base(p['name']): p for p in players}

    # --- acquisition (BBRef transactions) ---
    transactions = bbref.parse_transactions(os.path.join(RAW, 'bbref_transactions.html'))
    unresolved_acq = []
    matched_acq = 0
    # A player can appear multiple times in a season's transaction log (waived
    # then re-signed, etc.) — keep the most recent by date as the "current"
    # acquisition, matching how the app treats acquisition as current-state.
    latest_by_player = {}
    for t in transactions:
        key = t.get('bbrefId') or _base(t['name'])
        prev = latest_by_player.get(key)
        if prev is None or (t['date'] or '') >= (prev['date'] or ''):
            latest_by_player[key] = t
    for key, t in latest_by_player.items():
        target = by_id.get(t.get('bbrefId')) or by_name.get(_base(t['name']))
        if target is None:
            unresolved_acq.append({'name': t['name'], 'date': t['date'], 'method': t['method']})
            continue
        if t['date']:
            target['acquisition'] = {'date': t['date'], 'method': t['method']}
            matched_acq += 1

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


def build_salaryswish_league():
    """SalarySwish's two league-wide trackers (TPEs, hard-cap status) merged
    onto team-cap-state.json's CURRENT-season entries only — both are
    "right now" facts, not per-season projections, so they don't apply to
    the future seasons nbacaptracker otherwise projects. Requires
    team-cap-state.json to already exist (build_cap_state runs first)."""
    records = _load_json('team-cap-state', None)
    if records is None:
        raise RuntimeError('team-cap-state.json does not exist yet — run cap-state first')
    tpes = salaryswish.parse_trade_exceptions(os.path.join(RAW, 'salaryswish_trade_exceptions.html'))
    hard_caps = salaryswish.parse_hard_cap(os.path.join(RAW, 'salaryswish_hard_cap.html'))
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
    matched_tpe = matched_hc = 0
    for r in records:
        if r['season'] != CURRENT_SEASON_LABEL:
            continue
        if r['team'] in tpes_by_team:
            r['heldTPEs'] = tpes_by_team[r['team']]
            matched_tpe += 1
        if r['team'] in hardcap_by_team:
            r['hardCapped'] = hardcap_by_team[r['team']]
            matched_hc += 1
    json.dump(records, open(os.path.join(OUT, 'team-cap-state.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  held TPEs: {sum(len(v) for v in tpes_by_team.values())} across {matched_tpe} teams   '
          f'hard-capped teams: {matched_hc}')


def build_signing_incentives(offline=False):
    """Per-player SalarySwish scrape -> signedUnder + incentives, merged onto
    contract-details.json (written by build_clauses, which must run first).
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
        slug = salaryswish.slugify(p['name'])
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
            parsed = salaryswish.parse_player(path, team)
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
    json.dump(list(by_name.values()), open(os.path.join(OUT, 'contract-details.json'), 'w'), indent=1, ensure_ascii=False)


def build_cash_ledger():
    """Hoops Rumors' annual "Cash Sent, Received In NBA Trades" post ->
    team-cap-state.json's CURRENT-season entries only (a running balance for
    this league year, not something future seasons have a value for).
    Requires team-cap-state.json to already exist (build_cap_state runs
    first). Same dated-URL-bumped-each-season caveat as the other three
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
    {'name': 'picks', 'sources': ['realgm_future_drafts'], 'build': build_picks},
    {'name': 'enrichment', 'sources': ['bbref_transactions', 'hr_guarantee_dates', 'hr_non_guaranteed'],
     'build': build_enrichment},
    {'name': 'clauses', 'sources': ['hr_trade_kickers', 'hr_veto_trades'], 'build': build_clauses},
]


def main():
    offline = '--offline' in sys.argv
    os.makedirs(OUT, exist_ok=True)

    print('fetch:')
    failed = fetch_all(offline)

    print('parse:')
    written = []
    skipped = []

    for group in GROUPS:
        ok = not (set(group['sources']) & failed)
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
    try:
        build_cap_state(offline=offline)
        written.append('cap-state')
    except Exception as e:
        skipped.append(f'cap-state ({e})')
        print(f'  SKIP cap-state — {e}\n       keeping last-good output')

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
    try:
        build_apron_addon()
        written.append('apron-addon')
    except Exception as e:
        skipped.append(f'apron-addon ({e})')
        print(f'  SKIP apron-addon — {e}\n       keeping last-good output')

    if not written:
        print('\nERROR: every group failed this run — nothing to update.')
        sys.exit(1)

    if skipped:
        print('\nWARN: partial run. Updated: ' + ', '.join(written) + '.')
        print('WARN: skipped: ' + '; '.join(skipped) + '.')
        print('WARN: the generator diffs only groups that updated, so the PR '
              '(if any) will not touch the skipped data.')


if __name__ == '__main__':
    main()
