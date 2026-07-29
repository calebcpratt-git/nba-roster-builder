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
  players       BBRef contracts + draft classes             -> players.json, rookie-years.json, unresolved-draft-year.json
  picks         RealGM future drafts                        -> draft-picks.json
  enrichment    BBRef transactions + HR guarantee data       -> merged onto players.json (acquisition, guarantees)
  clauses       HR trade kickers + veto-trades               -> contract-details.json
  cap-state     nbacaptracker.com (30 team pages)            -> team-cap-state.json

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

import bbref, realgm, hoopsrumors, captracker

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'snapshots', 'raw')
CAPTRACKER_RAW = os.path.join(RAW, 'nbacaptracker')
OUT = os.path.join(ROOT, 'snapshots', 'scraped')
ROOKIE_YEARS_TS = os.path.join(ROOT, 'lib', 'rookie-years.ts')

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'
CURRENT_DRAFT_YEAR = 2026          # bump each June after the draft
DRAFT_YEARS = [CURRENT_DRAFT_YEAR, CURRENT_DRAFT_YEAR - 1]
CURRENT_SEASON_YEAR = 2026         # calendar year the current season starts — bump each July

# UPDATE THESE EACH SEASON — see the module docstring note above.
HR_GUARANTEE_DATES_URL = 'https://www.hoopsrumors.com/2026/05/early-nba-salary-guarantee-dates-for-2026-27.html'
HR_NON_GUARANTEED_URL = 'https://www.hoopsrumors.com/2026/07/2026-27-non-guaranteed-contracts-by-team.html'
HR_TRADE_KICKERS_URL = 'https://www.hoopsrumors.com/2025/08/nba-players-with-trade-kickers-in-2025-26.html'   # STALE — 2026/27 not yet published as of last update
HR_VETO_TRADES_URL = 'https://www.hoopsrumors.com/2025/07/nba-players-who-can-veto-trades-in-2025-26.html'    # STALE — 2026/27 not yet published as of last update

SOURCES = {
    'bbref_contracts': 'https://www.basketball-reference.com/contracts/players.html',
    'realgm_future_drafts': 'https://basketball.realgm.com/nba/draft/future_drafts/team',
    'bbref_transactions': f'https://www.basketball-reference.com/leagues/NBA_{CURRENT_DRAFT_YEAR}_transactions.html',
    'hr_guarantee_dates': HR_GUARANTEE_DATES_URL,
    'hr_non_guaranteed': HR_NON_GUARANTEED_URL,
    'hr_trade_kickers': HR_TRADE_KICKERS_URL,
    'hr_veto_trades': HR_VETO_TRADES_URL,
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
    season_label = f'{CURRENT_SEASON_YEAR}-{str(CURRENT_SEASON_YEAR + 1)[-2:]}'  # e.g. '2026-27'
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
