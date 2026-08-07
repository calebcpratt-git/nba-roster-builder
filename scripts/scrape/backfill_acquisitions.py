"""Manual, one-time (or occasional) backfill for the acquisition ledger —
see snapshots/scraped/acquisition-ledger.json and run.py's build_enrichment
docstring for the ledger design.

NOT part of the daily pipeline. run.py's --offline mode simply won't have
this script's raw HTML present, so it's silently skipped there like any
other absent source — that's fine, this is meant to run standalone.

SalarySwish's per-team transaction pages (the daily acquisition source)
only cover roughly the last few months, so a player whose last real
acquisition predates that window has nothing to match on any given day.
This script closes that gap once, from BBRef's PRIOR season transactions
page (fully published and stable, unlike the current season's page —
see bbref.py's parse_transactions docstring for why that distinction
matters) — not the daily pipeline's job, just a seed for the ledger.

Usage:
    python scripts/scrape/backfill_acquisitions.py [--years 2026 2025 ...]

Defaults to just the immediately prior season (CURRENT_SEASON_YEAR, e.g.
2026 = the already-published 2025-26 season). Pass more years to reach
further back for players still unresolved after the first pass.
"""
import argparse
import json
import os
import sys

import bbref
from run import RAW, OUT, ACQUISITION_LEDGER, CURRENT_SEASON_YEAR, _base, fetch_one, _load_json

BBREF_TRANSACTIONS_URL = 'https://www.basketball-reference.com/leagues/NBA_{year}_transactions.html'


def backfill(years, offline=False):
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist — run scripts/scrape/run.py at least once first')
    by_id = {p.get('bbrefId'): p for p in players if p.get('bbrefId')}
    by_name = {_base(p['name']): p for p in players}

    before_blank = sum(1 for p in players if not p.get('acquisition'))

    ledger = _load_json('acquisition-ledger', {})
    added, skipped_no_destination, skipped_no_target = 0, 0, 0

    for year in years:
        name = f'bbref_transactions_{year}'
        path = os.path.join(RAW, f'{name}.html')
        if not offline:
            url = BBREF_TRANSACTIONS_URL.format(year=year)
            ok = fetch_one(name, url)
            if not ok:
                print(f'  SKIP {year} — fetch failed after retries')
                continue
        elif not os.path.exists(path):
            print(f'  SKIP {year} — no cached snapshot, and --offline was passed')
            continue

        records = bbref.parse_transactions(path)
        print(f'  {year}: {len(records)} raw transaction rows')

        # Keep most-recent-by-date per player, same rule as the daily
        # SalarySwish merge, so a player appearing multiple times in one
        # season's log (waived, re-signed) resolves to their latest event.
        latest = {}
        for r in records:
            # parse_transactions attributes toTeams per CLAUSE (see
            # bbref.py's _split_clauses), so a multi-team trade no longer
            # produces ambiguity here — each player's toTeams is exactly
            # their own destination. len == 0 only happens for waivers
            # (there's no destination team by definition), which genuinely
            # can't seed an acquisition record; correctly skipped, not guessed.
            if len(r['toTeams']) != 1:
                skipped_no_destination += 1
                continue
            key = r.get('bbrefId') or _base(r['name'])
            prev = latest.get(key)
            if prev is None or (r['date'] or '') >= (prev['date'] or ''):
                latest[key] = r

        for _, r in latest.items():
            if not r['date']:
                continue
            # Only fall back to name-matching when BBRef gave no bbrefId at
            # all — if it DID give one and by_id has no match, that's real
            # evidence this is a different, unrelated person (not just a
            # miss), and matching by name anyway would silently merge two
            # different people's histories. Confirmed live 2026-08-07:
            # OKC's Jaylin Williams (willija07) got a SAC free-agent-signing
            # record that actually belonged to a different Jaylin Williams
            # (willija08, not even on our current roster) — same name, BBRef
            # gave the correct distinct id both times, but the old
            # id-or-name fallback ignored that and merged them by name.
            if r.get('bbrefId'):
                target = by_id.get(r['bbrefId'])
            else:
                target = by_name.get(_base(r['name']))
            if target is None:
                skipped_no_target += 1
                continue
            # Key off the RESOLVED player's own identity (same fix as
            # run.py's build_enrichment) so a backfilled entry and a later
            # daily SalarySwish match for the same person always land under
            # the same ledger key, instead of silently forking into two.
            key = target.get('bbrefId') or _base(target['name'])
            team = r['toTeams'][0]
            existing = ledger.get(key)
            if existing is not None and (existing.get('date') or '') >= r['date']:
                continue  # ledger already has this or something newer
            ledger[key] = {'date': r['date'], 'method': r['method'], 'team': team}
            added += 1

    json.dump(ledger, open(ACQUISITION_LEDGER, 'w'), indent=1, ensure_ascii=False)

    # Apply the freshly-seeded ledger onto players.json right away (subject
    # to the same team-match gate the daily run uses), so this script's
    # effect is visible without waiting for tomorrow's scheduled run.
    applied = 0
    for p in players:
        key = p.get('bbrefId') or _base(p['name'])
        entry = ledger.get(key)
        if entry is None or p.get('acquisition'):
            continue
        if entry.get('team') == p.get('team'):
            p['acquisition'] = {'date': entry['date'], 'method': entry['method']}
            applied += 1
    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)

    after_blank = sum(1 for p in players if not p.get('acquisition'))
    print(f'\n  ledger entries added/updated: {added}')
    print(f'  skipped (waiver, no destination team): {skipped_no_destination}')
    print(f'  skipped (no matching player): {skipped_no_target}')
    print(f'  players.json applied: {applied} newly filled')
    print(f'  blank acquisition: {before_blank} -> {after_blank}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--years', type=int, nargs='+', default=[CURRENT_SEASON_YEAR])
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    backfill(args.years, offline=args.offline)
