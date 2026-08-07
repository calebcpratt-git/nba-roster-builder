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
  free-agent-reconciliation  RealGM free-agent-options +          -> corrects stale CURRENT_SEASON_LABEL option
                      current-free-agents pages                      flags directly on players.json (no new file)
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
        current_free_agents page with a matching prior team -> remove that
        season's salary + options entries, since there's no valid contract
        number for an unsigned free agent.
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

    options = realgm.parse_free_agent_options(os.path.join(RAW, 'realgm_free_agent_options.html'))
    free_agents = realgm.parse_current_free_agents(os.path.join(RAW, 'realgm_current_free_agents.html'))

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
    for p in players:
        season_option = p.get('options', {}).get(CURRENT_SEASON_LABEL)
        if season_option not in ('Player', 'Team'):
            continue
        checked += 1

        matched_options = [o for o in options_by_name_season.get((_base(p['name']), CURRENT_SEASON_LABEL), [])
                            if o['team'] == p['team']]
        corroborated = bool(matched_options)

        fa = fa_by_name.get(_base(p['name']))
        txn = latest_txn.get(p.get('bbrefId')) or latest_txn.get(_base(p['name']))
        txn_team = txn['toTeams'][0] if txn and len(txn.get('toTeams', [])) == 1 else None

        if fa is not None and fa['priorTeam'] == p['team']:
            # declined and still unsigned — no valid salary figure for this season
            p.get('salary', {}).pop(CURRENT_SEASON_LABEL, None)
            p.get('options', {}).pop(CURRENT_SEASON_LABEL, None)
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
        else:
            # not an unsigned free agent under this team — treat as resolved
            # in place (exercised / already re-signed with the SAME team);
            # the flag is stale, the salary figure and team are not
            p.get('options', {}).pop(CURRENT_SEASON_LABEL, None)
            resolved_in_place.append({'name': p['name'], 'team': p['team'], 'season': CURRENT_SEASON_LABEL,
                                       'optionType': season_option, 'corroborated': corroborated})

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

    Requires team-cap-state.json to already exist (build_cap_state runs
    first)."""
    records = _load_json('team-cap-state', None)
    if records is None:
        raise RuntimeError('team-cap-state.json does not exist yet — run build_cap_state first')

    free_agents = realgm.parse_current_free_agents(os.path.join(RAW, 'realgm_current_free_agents.html'))
    fa_by_name = {}
    for fa in free_agents:
        fa_by_name[_base(fa['name'])] = fa

    removed = []
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
    print(f'  cap-hold reconciliation: {len(removed)} stale hold(s) removed/flagged')
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
    json.dump(list(by_name.values()), open(os.path.join(OUT, 'contract-details.json'), 'w'), indent=1, ensure_ascii=False)


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
    {'name': 'free-agent-reconciliation',
     'sources': ['realgm_free_agent_options', 'realgm_current_free_agents'],
     'build': build_free_agent_reconciliation},
    {'name': 'picks', 'sources': ['realgm_future_drafts'], 'build': build_picks},
    {'name': 'enrichment', 'sources': ['hr_guarantee_dates', 'hr_non_guaranteed'],
     'build': build_enrichment},
    {'name': 'clauses', 'sources': ['hr_trade_kickers', 'hr_veto_trades'], 'build': build_clauses},
]


def main():
    offline = '--offline' in sys.argv
    os.makedirs(OUT, exist_ok=True)

    # Snapshot unresolved-*.json counts before this run touches anything, so
    # we can tell afterward whether NEW unmatched entries appeared (a real
    # regression) versus the same steady-state undrafted/unmatched players
    # every run carries forward.
    unresolved_before = count_unresolved()

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

    print('cap-hold reconciliation (RealGM current free agents — merges onto team-cap-state.json):')
    if 'realgm_current_free_agents' in failed:
        skipped.append('cap-hold-reconciliation (fetch failed)')
        print('  SKIP cap-hold-reconciliation — fetch failed; keeping last-good output')
    else:
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

    unresolved_after = count_unresolved()
    new_unresolved = {
        label: max(0, unresolved_after[label] - unresolved_before.get(label, 0))
        for label in UNRESOLVED_FILES
    }
    status = {
        'written': written,
        'staleSources': skipped,
        'unresolved': {
            'before': unresolved_before,
            'after': unresolved_after,
            'newUnresolved': sum(new_unresolved.values()),
            'newByCategory': {k: v for k, v in new_unresolved.items() if v > 0},
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
