"""Fetch -> parse -> normalize. Writes JSON for the Node generators to consume.

Usage:  python scripts/scrape/run.py [--offline]
  --offline   reuse snapshots/raw/*.html instead of hitting the network

Resilience:
  Each source is fetched with a few retries and a short backoff, because
  RealGM sits behind Cloudflare and intermittently returns 403 to datacenter
  IPs like GitHub Actions runners (a fresh request usually flips to 200). If a
  source still fails after every retry, the run does NOT abort: it keeps the
  last committed snapshots/scraped/*.json for that source and updates the rest,
  so a RealGM blip no longer takes down the Basketball Reference half. The run
  only exits non-zero if *every* source is unreachable.
"""
import json, os, re, sys, time, random, unicodedata, urllib.request, urllib.error

import bbref, realgm

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'snapshots', 'raw')
OUT = os.path.join(ROOT, 'snapshots', 'scraped')
ROOKIE_YEARS_TS = os.path.join(ROOT, 'lib', 'rookie-years.ts')

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'
CURRENT_DRAFT_YEAR = 2026          # bump each June after the draft
DRAFT_YEARS = [CURRENT_DRAFT_YEAR, CURRENT_DRAFT_YEAR - 1]

SOURCES = {
    'bbref_contracts': 'https://www.basketball-reference.com/contracts/players.html',
    'realgm_future_drafts': 'https://basketball.realgm.com/nba/draft/future_drafts/team',
    **{f'bbref_draft_{y}': f'https://www.basketball-reference.com/draft/NBA_{y}.html' for y in DRAFT_YEARS},
}

# The two independent halves of a run. If any source in a half fails, only that
# half's outputs are skipped; the other half still updates.
PLAYERS_SOURCES = ['bbref_contracts', *[f'bbref_draft_{y}' for y in DRAFT_YEARS]]
PICKS_SOURCES = ['realgm_future_drafts']

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
    """Fetch every source. Never raises for a single source; returns the set of
    source names that could not be obtained this run."""
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
        players.append({'name': c['name'], 'team': c['team'],
                        'salary': c['salary'], 'options': c['options']})
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


def main():
    offline = '--offline' in sys.argv
    os.makedirs(OUT, exist_ok=True)

    print('fetch:')
    failed = fetch_all(offline)
    players_ok = not (set(PLAYERS_SOURCES) & failed)
    picks_ok = not (set(PICKS_SOURCES) & failed)

    print('parse:')
    skipped = []

    # Each half is guarded independently. A half is only rewritten when BOTH its
    # fetch and its parse succeed; any failure skips just that half and leaves
    # its last-committed snapshots/scraped/*.json in place (a fetch can return
    # 200 with a junk body, so the parse has to be non-fatal too, not just the
    # fetch).
    players_written = False
    if players_ok:
        try:
            build_players()
            players_written = True
        except Exception as e:
            skipped.append(f'Basketball Reference (parse failed: {e})')
            print(f'  SKIP players — parse error: {e}\n'
                  '       keeping last-good players / rookie-years / unresolved-draft-year')
    else:
        skipped.append('Basketball Reference (fetch failed)')
        print('  SKIP players — fetch failed; keeping last-good '
              'players / rookie-years / unresolved-draft-year')

    picks_written = False
    if picks_ok:
        try:
            build_picks()
            picks_written = True
        except Exception as e:
            skipped.append(f'RealGM (parse failed: {e})')
            print(f'  SKIP picks — parse error: {e}\n'
                  '       keeping last-good draft-picks')
    else:
        skipped.append('RealGM (fetch failed)')
        print('  SKIP picks — fetch failed; keeping last-good draft-picks')

    if not players_written and not picks_written:
        print('\nERROR: both halves failed this run — nothing to update.')
        sys.exit(1)

    if skipped:
        print('\nWARN: partial run. Updated the half that succeeded and kept '
              'last-good data for: ' + '; '.join(skipped) + '.')
        print('WARN: the generator diffs only the half that updated, so the PR '
              '(if any) will not touch the skipped data.')


if __name__ == '__main__':
    main()
