"""Basketball Reference: player contracts and draft classes."""
import os
import time
import random
import urllib.request
import urllib.error
from bs4 import BeautifulSoup
from datetime import datetime
import re

SEASON_COL = {'y1': '2026-27', 'y2': '2027-28', 'y3': '2028-29',
              'y4': '2029-30', 'y5': '2030-31', 'y6': '2031-32'}
OPTION_CLASS = {'salary-tm': 'Team', 'salary-pl': 'Player'}

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'
PLAYER_URL = 'https://www.basketball-reference.com/players/{first}/{bbrefId}.html'
MIN_BYTES = 5_000
FETCH_TRIES = 3
BACKOFF_BASE = 3


def fetch_page(url, path):
    """Single-URL fetch with retry, mirrors salaryswish.py's fetch_page."""
    for attempt in range(1, FETCH_TRIES + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < MIN_BYTES:
                raise RuntimeError(f'suspiciously small response ({len(data)} bytes)')
            open(path, 'wb').write(data)
            return True
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as e:
            reason = getattr(e, 'code', None) or getattr(e, 'reason', None) or e
            if attempt < FETCH_TRIES:
                time.sleep(BACKOFF_BASE * (2 ** (attempt - 1)) + random.uniform(0, 1))
            else:
                print(f'    FAILED  {url}  ({reason})')
    return False


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
    seen = set()
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
        # BBRef's contracts table occasionally repeats a player's row verbatim
        # (confirmed live for De'Anthony Melton — two identical <tr>s, same
        # rank-adjacent duplicate, not a traded-mid-season split) — dedupe by
        # id (or name+team when a row has no bbrefId) so it doesn't produce
        # two Player records that only an enrichment step downstream (which
        # keys off bbrefId/name and would silently pick just one to update)
        # would make look different.
        dedupe_key = _player_id(cells['player']) or (name, team)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
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


def parse_player_debut(path, current_season_year):
    """Individual /players/{x}/{bbrefId}.html bio -> rookie season (the
    calendar year the season STARTS, matching parse_draft's draftYear).
    Fallback source for players parse_draft can't place: draft-class pages
    only cover CURRENT_DRAFT_YEAR and the year before (see run.py), so
    anyone drafted earlier, or genuinely undrafted, is invisible to that
    join even though their own bio page always states this directly —
    verified live against several current unresolved-draft-year.json
    entries (e.g. Spencer Jones, Tolu Smith, Ryan Nembhard).

    Two cases, both on every player's bio 'meta' block:
      'NBA Debut: April 13, 2025' — season-boundary rule: Aug-Dec debut
      belongs to the season starting that calendar year; Jan-Jul debut
      belongs to the season that started the PREVIOUS calendar year (the
      regular season runs roughly Oct-Jun). Verified against Tolu Smith
      (debut Apr 13, 2025 -> rookie year 2024, the 2024-25 season).
      'Experience: Rookie' — no debut yet (signed but hasn't played, e.g.
      a 2026 second-round pick before opening night) -> current_season_year.
    Returns None if neither is present (page layout changed, or truly no
    bio data) — caller treats that as still-unresolved, not a hard failure."""
    meta = _soup(path).find('div', id='meta')
    if meta is None:
        return None
    text = meta.get_text(' ', strip=True)
    if re.search(r'Experience:\s*Rookie\b', text):
        return current_season_year
    m = re.search(r'NBA Debut:\s*([A-Za-z]+ \d{1,2},\s*\d{4})', text)
    if not m:
        return None
    try:
        debut = datetime.strptime(re.sub(r'\s+', ' ', m.group(1)), '%B %d, %Y')
    except ValueError:
        return None
    return debut.year if debut.month >= 8 else debut.year - 1


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


def classify_transaction(text):
    """Map transaction prose -> a method matching Player['acquisition']['method']
    in lib/types.ts: 'draft' | 'trade' | 'free-agent' | 'waiver' | 'sign-and-trade' | 'extension'."""
    t = text.lower()
    if ' traded ' in t:
        return 'trade'
    if 'claimed' in t and 'waivers' in t:
        return 'waiver'
    if re.search(r'\bsigned\b', t) or 'waived' in t or 'released' in t:
        # BBRef's transactions log doesn't separately tag "sign-and-trade" combos
        # or extensions distinctly from a plain signing in its prose — both come
        # back as 'free-agent' here. Refine this classifier if that distinction
        # turns out to matter for validation logic.
        return 'free-agent'
    if 'draft' in t and 'selected' in t:
        return 'draft'
    return 'free-agent'  # conservative default; better than silently dropping the record


def parse_transactions(path):
    """Basketball-Reference season transactions page -> acquisition records.
    -> [{bbrefId, name, date, method, toTeams, fromTeams, text, flags}]
    Source: basketball-reference.com/leagues/NBA_{season}_transactions.html
    """
    soup = _soup(path)
    items = soup.select('ul.page_index > li')
    if not items:
        raise RuntimeError('transactions page_index not found — page layout changed')
    out = []
    for li in items:
        date_span = li.find('span')
        date_raw = date_span.get_text(strip=True) if date_span else None
        date = None
        if date_raw:
            try:
                date = datetime.strptime(date_raw, '%B %d, %Y').date().isoformat()
            except ValueError:
                pass
        for p in li.find_all('p'):
            # A separator is required here: BBRef's transaction sentences
            # interleave plain text with <a> links with no guaranteed space at
            # the boundary in the DOM, and get_text(strip=True) strips each
            # fragment individually — without a separator, "The Warriors
            # traded X" collapses into "TheWarriorstradedX", which silently
            # breaks classify_transaction's substring checks (e.g. ' traded ').
            text = p.get_text(' ', strip=True)
            if not text:
                continue
            to_teams = [a['data-attr-to'] for a in p.find_all('a', attrs={'data-attr-to': True})]
            from_teams = [a['data-attr-from'] for a in p.find_all('a', attrs={'data-attr-from': True})]
            players = []
            for a in p.find_all('a', href=re.compile(r'^/players/[a-z]/')):
                pid = a['href'].rsplit('/', 1)[-1].replace('.html', '')
                players.append({'bbrefId': pid, 'name': a.get_text(strip=True)})
            method = classify_transaction(text)
            for pl in players:
                out.append({
                    'bbrefId': pl['bbrefId'],
                    'name': pl['name'],
                    'date': date,
                    'dateRaw': date_raw,
                    'method': method,
                    'toTeams': to_teams,
                    'fromTeams': from_teams,
                    'text': text,
                    # BBRef occasionally mangles multi-team-trade markup into a
                    # literal "FROM_TRADE" placeholder. Flag for review, don't drop.
                    'flags': ['BBREF_PLACEHOLDER'] if 'FROM_TRADE' in text else [],
                })
    if not out:
        raise RuntimeError('transactions parsed to zero rows — page layout changed')
    return out
