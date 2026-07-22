"""Basketball Reference: player contracts and draft classes."""
from bs4 import BeautifulSoup
import re

SEASON_COL = {'y1': '2026-27', 'y2': '2027-28', 'y3': '2028-29',
              'y4': '2029-30', 'y5': '2030-31', 'y6': '2031-32'}
OPTION_CLASS = {'salary-tm': 'Team', 'salary-pl': 'Player'}


def _soup(path):
    return BeautifulSoup(open(path, encoding='utf-8', errors='replace').read(), 'html.parser')


def _money(td):
    csk = td.get('csk')
    if csk not in (None, ''):
        return int(float(csk))
    txt = td.get_text(strip=True).replace('$', '').replace(',', '')
    return int(txt) if txt else None


def _player_id(cell):
    pid = cell.get('data-append-csv')
    if pid:
        return pid
    a = cell.find('a', href=re.compile(r'/players/'))
    return a['href'].rsplit('/', 1)[-1].replace('.html', '') if a else None


def parse_contracts(path):
    """-> [{name, bbrefId, team, salary{season:int}, options{season:'Team'|'Player'}, remainingGuaranteed}]"""
    table = _soup(path).find('table', id='player-contracts')
    if table is None:
        raise RuntimeError('player-contracts table not found — page layout changed')
    out = []
    for tr in table.find('tbody').find_all('tr'):
        if 'thead' in (tr.get('class') or []):
            continue
        cells = {c.get('data-stat'): c for c in tr.find_all(['th', 'td'])}
        if 'player' not in cells or 'team_id' not in cells:
            continue
        name = cells['player'].get_text(strip=True)
        team = cells['team_id'].get_text(strip=True)
        if not name or not team:
            continue
        salary, options = {}, {}
        for col, season in SEASON_COL.items():
            td = cells.get(col)
            if td is None:
                continue
            v = _money(td)
            if v is None:
                continue
            salary[season] = v
            for cls in (td.get('class') or []):
                if cls in OPTION_CLASS:
                    options[season] = OPTION_CLASS[cls]
        out.append({
            'name': name,
            'bbrefId': _player_id(cells['player']),
            'team': team,
            'salary': salary,
            'options': options,
            'remainingGuaranteed': _money(cells['remain_gtd']) if 'remain_gtd' in cells else None,
        })
    if not out:
        raise RuntimeError('contracts table parsed to zero rows — page layout changed')
    return out


def parse_draft(path, year):
    """-> [{name, bbrefId, draftYear, pick, draftTeam}]"""
    table = _soup(path).find('table', id='stats')
    if table is None:
        raise RuntimeError(f'draft stats table not found for {year} — page layout changed')
    out = []
    for tr in table.find('tbody').find_all('tr'):
        if 'thead' in (tr.get('class') or []):
            continue
        cells = {c.get('data-stat'): c for c in tr.find_all(['th', 'td'])}
        pcell = cells.get('player')
        if pcell is None or not pcell.get_text(strip=True):
            continue
        pick = cells.get('pick_overall')
        pick = int(pick.get_text(strip=True)) if pick and pick.get_text(strip=True).isdigit() else None
        out.append({
            'name': pcell.get_text(strip=True),
            'bbrefId': _player_id(pcell),
            'draftYear': year,
            'pick': pick,
            'draftTeam': cells['team_id'].get_text(strip=True) if 'team_id' in cells else None,
        })
    return out
