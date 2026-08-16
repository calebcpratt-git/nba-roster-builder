"""Basketball-Reference per-season awards pages -> MVP/DPOY/All-NBA history.

Source: basketball-reference.com/awards/awards_{year}.html (one page per
season, BBRef's URL year = the season's END calendar year, same convention
as bbref.py's parse_transactions). Confirmed live 2026-08-16: table IDs and
columns are stable across seasons (checked 2025 and 2010).

Only pulls what the app's Higher Max Criteria (supermax eligibility) needs:
the MVP and DPOY winners (rank 1 in the voting table — not every candidate
on the ballot) and the full official All-NBA selections (all 15 rows of
`leading_all_nba`, which carries the team designation directly via
`all_nba_team`: '1T'/'2T'/'3T'). Deliberately skips `leading_all_defense`,
`roy`, `smoy`, `mip` — not used by any CBA rule this app models.

This is a pure parser, like bbref.py's parse_transactions — fetching is
run.py's job (build_player_awards uses the same fetch_one() as the
acquisition-history backfill)."""
import re
from bs4 import BeautifulSoup


def _soup(path):
    return BeautifulSoup(open(path, encoding='utf-8', errors='replace').read(), 'html.parser')


def _player_cell(tr):
    """Find the row's player cell — carries the name and, via
    data-append-csv, the bbrefId, same attribute bbref.py's contracts/draft
    parsing already relies on."""
    for stat in ('player', 'player_wnba'):
        td = tr.find(['td', 'th'], attrs={'data-stat': stat})
        if td is not None:
            return td
    return None


def _player_id(cell):
    pid = cell.get('data-append-csv')
    if pid:
        return pid
    a = cell.find('a', href=re.compile(r'/players/'))
    return a['href'].rsplit('/', 1)[-1].replace('.html', '') if a else None


def _winner_row(table):
    """The rank-1 row of a voting table (mvp/dpoy) — BBRef's `mvp`/`dpoy`
    tables are already sorted by finish, rank 1 first, but check the `rank`
    column explicitly rather than trust row order alone."""
    if table is None:
        return None
    rows = table.find('tbody').find_all('tr')
    rows = [r for r in rows if 'thead' not in (r.get('class') or [])]
    if not rows:
        return None
    rank_cell = rows[0].find(['td', 'th'], attrs={'data-stat': 'rank'})
    if rank_cell is not None and rank_cell.get_text(strip=True) not in ('1', ''):
        # Unexpected sort order — don't guess a winner.
        return None
    return rows[0]


def parse_awards(path, year):
    """-> [{name, bbrefId, season, award}]
    award is 'MVP' | 'DPOY' | 'All-NBA-1' | 'All-NBA-2' | 'All-NBA-3'.
    season is the BBRef award-year's app-format label, e.g. year=2026 ->
    '2025-26' (BBRef's awards_{year}.html year is the season's END year,
    same convention parse_transactions uses)."""
    soup = _soup(path)
    season = f'{year - 1}-{str(year)[-2:]}'
    out = []

    for award, table_id in (('MVP', 'mvp'), ('DPOY', 'dpoy')):
        table = soup.find('table', id=table_id)
        row = _winner_row(table)
        if row is None:
            continue
        cell = _player_cell(row)
        if cell is None:
            continue
        name = cell.get_text(strip=True)
        if not name:
            continue
        out.append({'name': name, 'bbrefId': _player_id(cell), 'season': season, 'award': award})

    all_nba = soup.find('table', id='leading_all_nba')
    if all_nba is not None:
        for tr in all_nba.find('tbody').find_all('tr'):
            if 'thead' in (tr.get('class') or []):
                continue
            team_cell = tr.find(['td', 'th'], attrs={'data-stat': 'all_nba_team'})
            cell = _player_cell(tr)
            if team_cell is None or cell is None:
                continue
            team_text = team_cell.get_text(strip=True)
            m = re.match(r'^(1|2|3)', team_text)
            if not m:
                continue
            name = cell.get_text(strip=True)
            if not name:
                continue
            out.append({
                'name': name,
                'bbrefId': _player_id(cell),
                'season': season,
                'award': f'All-NBA-{m.group(1)}',
            })

    if not out:
        raise RuntimeError(f'awards_{year}.html parsed to zero rows — page layout changed')
    return out
