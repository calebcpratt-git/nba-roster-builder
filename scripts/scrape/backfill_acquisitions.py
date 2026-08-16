"""Manual, occasional backfill for the full acquisition-history ledger —
see snapshots/scraped/acquisition-history-ledger.json and run.py's
build_enrichment docstring for the ledger design.

NOT part of the daily pipeline. run.py's --offline mode simply won't have
this script's raw HTML present, so it's silently skipped there like any
other absent source — that's fine, this is meant to run standalone.

SalarySwish's per-team transaction pages (the daily acquisition source)
only cover roughly the last few months, so on their own they can never
answer "was this player traded to his current team within his first four
seasons" — a trade from years ago is long out of that window. This script
closes that gap by walking BBRef's PAST season transaction pages (fully
published and stable, unlike the current season's page — see
bbref.py's parse_transactions docstring for why that distinction matters),
building a full multi-year history per player rather than a single
most-recent record. The daily pipeline (run.py's build_enrichment) then
appends each day's freshest SalarySwish match on top of whatever this
script seeded, so the ledger stays a rolling history: BBRef for depth,
SalarySwish for currency.

Usage:
    python scripts/scrape/backfill_acquisitions.py [--years 2026 2025 ...]

Defaults to the last 5 completed seasons (CURRENT_SEASON_YEAR down through
CURRENT_SEASON_YEAR-4 — e.g. with CURRENT_SEASON_YEAR=2026 that's the
already-published 2025-26 through 2021-22 seasons). Pass more/fewer years
to adjust the backfill depth; safe to re-run at any depth, entries are
merged and deduped rather than replaced.
"""
import argparse
import json
import os

import bbref
from run import RAW, OUT, ACQUISITION_HISTORY_LEDGER, CURRENT_SEASON_YEAR, _base, fetch_one, _load_json

BBREF_TRANSACTIONS_URL = 'https://www.basketball-reference.com/leagues/NBA_{year}_transactions.html'


def backfill(years, offline=False):
    players = _load_json('players', None)
    if players is None:
        raise RuntimeError('players.json does not exist — run scripts/scrape/run.py at least once first')
    by_id = {p.get('bbrefId'): p for p in players if p.get('bbrefId')}
    by_name = {_base(p['name']): p for p in players}

    before = sum(len(p.get('acquisitionHistory') or []) for p in players)

    # {playerKey: [{date, method, team}, ...]} — one full history per player,
    # unlike the old single-entry acquisition-ledger.json this replaces.
    ledger = _load_json('acquisition-history-ledger', {})
    added, skipped_no_destination, skipped_no_target, deduped = 0, 0, 0, 0

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

        for r in records:
            # parse_transactions attributes toTeams per CLAUSE (see
            # bbref.py's _split_clauses), so a multi-team trade doesn't
            # produce ambiguity here — each player's toTeams is exactly
            # their own destination. len == 0 only happens for waivers
            # (there's no destination team by definition), which genuinely
            # can't seed an acquisition record; correctly skipped, not guessed.
            # BBRef also occasionally mangles a clause's team anchor into
            # empty text (confirmed live 2026-08-16: "The signed Jamal Cain
            # to an Exhibit 10 contract." — toTeams == ['']), so an empty
            # string is treated the same as no destination at all.
            if len(r['toTeams']) != 1 or not r['toTeams'][0] or not r['date']:
                skipped_no_destination += 1
                continue

            # Only fall back to name-matching when BBRef gave no bbrefId at
            # all — if it DID give one and by_id has no match, that's real
            # evidence this is a different, unrelated person (not just a
            # miss), and matching by name anyway would silently merge two
            # different people's histories. Confirmed live 2026-08-07:
            # OKC's Jaylin Williams (willija07) got a SAC free-agent-signing
            # record that actually belonged to a different Jaylin Williams
            # (willija08, not even on our current roster) — same name, BBRef
            # gave the correct distinct id both times, but an id-or-name
            # fallback ignored that and merged them by name.
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
            entry = {'date': r['date'], 'method': r['method'], 'team': r['toTeams'][0]}
            history = ledger.setdefault(key, [])
            if any(h['date'] == entry['date'] and h['method'] == entry['method'] and h['team'] == entry['team']
                   for h in history):
                deduped += 1
                continue
            history.append(entry)
            added += 1

    # Keep every player's history sorted ascending by date, oldest first —
    # matches the shape generate-player-data.js expects to emit.
    for key in ledger:
        ledger[key].sort(key=lambda h: h['date'])

    json.dump(ledger, open(ACQUISITION_HISTORY_LEDGER, 'w'), indent=1, ensure_ascii=False)

    # Apply the freshly-seeded ledger onto players.json right away (subject
    # to no team-match gate here, unlike the single-record ledger — full
    # history is meaningful even for a team the player has since left), so
    # this script's effect is visible without waiting for tomorrow's run.
    applied = 0
    for p in players:
        key = p.get('bbrefId') or _base(p['name'])
        history = ledger.get(key)
        if not history:
            continue
        p['acquisitionHistory'] = history
        applied += 1
    json.dump(players, open(os.path.join(OUT, 'players.json'), 'w'), indent=1, ensure_ascii=False)

    after = sum(len(p.get('acquisitionHistory') or []) for p in players)
    print(f'\n  ledger records added: {added}  (deduped: {deduped})')
    print(f'  skipped (waiver, no destination team): {skipped_no_destination}')
    print(f'  skipped (no matching player): {skipped_no_target}')
    print(f'  players.json applied: {applied} players updated')
    print(f'  total acquisitionHistory records: {before} -> {after}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--years', type=int, nargs='+', default=[CURRENT_SEASON_YEAR - i for i in range(5)])
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    backfill(args.years, offline=args.offline)
