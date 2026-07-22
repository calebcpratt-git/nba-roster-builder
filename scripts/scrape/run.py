"""Fetch -> parse -> normalize. Writes JSON for the Node generators to consume.

Usage:  python scripts/scrape/run.py [--offline]
  --offline   reuse snapshots/raw/*.html instead of hitting the network
"""
import json, os, re, sys, time, unicodedata, urllib.request

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


def fetch_all(offline=False):
    os.makedirs(RAW, exist_ok=True)
    for name, url in SOURCES.items():
        path = os.path.join(RAW, f'{name}.html')
        if offline:
            if not os.path.exists(path):
                raise SystemExit(f'--offline but {path} is missing')
            print(f'  offline  {name}')
            continue
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        if len(data) < 20_000:
            raise RuntimeError(f'{name}: suspiciously small response ({len(data)} bytes)')
        open(path, 'wb').write(data)
        print(f'  fetched  {name}  ({len(data):,} bytes)')
        time.sleep(4)          # be a polite guest


def _base(name):
    n = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    n = n.lower().replace('.', '').replace("'", '').replace('-', ' ')
    return re.sub(r'\s+', ' ', re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', n)).strip()


def existing_rookie_years():
    if not os.path.exists(ROOKIE_YEARS_TS):
        return {}
    src = open(ROOKIE_YEARS_TS, encoding='utf-8').read()
    return {_base(m[0]): int(m[1]) for m in re.findall(r'"([^"]+)"\s*:\s*(\d{4})', src)}


def main():
    offline = '--offline' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    print('fetch:')
    fetch_all(offline)

    print('parse:')
    contracts = bbref.parse_contracts(os.path.join(RAW, 'bbref_contracts.html'))
    draft = []
    for y in DRAFT_YEARS:
        draft += bbref.parse_draft(os.path.join(RAW, f'bbref_draft_{y}.html'), y)
    picks, pick_stats = realgm.parse_picks(os.path.join(RAW, 'realgm_future_drafts.html'))
    picks = [p for p in picks if p['year'] != CURRENT_DRAFT_YEAR]  # already converted to real players
    print(f'  contracts {len(contracts)}   draftees {len(draft)}   picks {len(picks)}   '
          f'(count-reconciled: {pick_stats["sections"] - pick_stats["unreconciled"]}/{pick_stats["sections"]} sections)')

    print('normalize:')
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
    json.dump(picks, open(os.path.join(OUT, 'draft-picks.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(rookie_years, open(os.path.join(OUT, 'rookie-years.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(unresolved, open(os.path.join(OUT, 'unresolved-draft-year.json'), 'w'), indent=1, ensure_ascii=False)

    print(f'  players {len(players)}   picks {len(picks)}   '
          f'draft years {len(rookie_years)}   unresolved {len(unresolved)}')
    if unresolved:
        print('  (unresolved draft years are undrafted players — expected, not an error)')


if __name__ == '__main__':
    main()
