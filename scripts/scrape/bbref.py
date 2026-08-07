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
        # BBRef's contracts table occasionally repeats a player's row —
        # sometimes verbatim (confirmed live for De'Anthony Melton, same
        # team both times), but NOT always: confirmed live 2026-08-07,
        # Damian Lillard/Bradley Beal/Olivier-Maxence Prosper each have two
        # rows under DIFFERENT teams with different remain_gtd figures — a
        # real split BBRef hasn't consolidated, not a copy-paste artifact.
        # Deduping on id-alone (the old behavior) silently kept whichever
        # row happened to come first and discarded the other with no
        # record it ever existed — for Lillard that meant keeping the
        # stale MIL row and losing the correct POR one. Deduping on
        # (id, team) instead only collapses TRUE verbatim repeats; a real
        # team split comes through as two distinct rows for
        # build_players() to resolve deliberately, cross-referenced
        # against other sources — see resolve_duplicate_bbrefIds() in
        # run.py.
        dedupe_key = (_player_id(cells['player']), team) if _player_id(cells['player']) else (name, team)
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


# ---------------------------------------------------------------------------
# Season transactions page — restored 2026-08-07 for scripts/scrape/
# backfill_acquisitions.py's one-time historical seed of the acquisition
# ledger. Retired 2026-08-06 as the DAILY acquisition source (see run.py's
# build_enrichment docstring) because the current season's page doesn't
# exist until weeks/months in; that problem doesn't apply to a PRIOR
# season's page, which is fully published and stable — confirmed live for
# NBA_2026_transactions.html (the 2025-26 season) on 2026-08-07.
def classify_transaction(text):
    """Map transaction prose -> a method matching Player['acquisition']['method']
    in lib/types.ts: 'draft' | 'trade' | 'free-agent' | 'waiver' | 'sign-and-trade' | 'extension'."""
    t = text.lower()
    if ' traded ' in t:
        return 'trade'
    if 'claimed' in t and 'waivers' in t:
        return 'waiver'
    if re.search(r'\bsigned\b', t):
        # Checked before the generic signed->free-agent fallback: BBRef's
        # prose says "...to a contract extension" verbatim for extensions
        # (confirmed live, e.g. Devin Booker/PHO) — SalarySwish's classifier
        # already makes this same distinction, so carry it over here too
        # rather than collapsing every signing into 'free-agent' like the
        # original (pre-retirement) version of this function did.
        if 'extension' in t:
            return 'extension'
        return 'free-agent'
    if 'waived' in t or 'released' in t:
        return 'free-agent'
    if 'draft' in t and 'selected' in t:
        return 'draft'
    return 'free-agent'  # conservative default; better than silently dropping the record


def _split_clauses(p):
    """Split a transaction <p>'s direct children into clauses on top-level
    '; ' text boundaries. A multi-team trade is one long sentence of
    semicolon-joined clauses, each self-contained: "the X traded PLAYER(S)
    to the Y" — confirmed live (2025-02-06 Butler/5-team trade): each clause
    carries exactly one data-attr-from anchor and one data-attr-to anchor,
    with the specific player link(s) for that clause in between. A plain
    single-event paragraph (a signing, a waiver, a simple 2-team trade) has
    no semicolon and comes back as one clause — this function is a strict
    generalization of "the whole paragraph", not a special case for trades."""
    clauses, current = [], []
    for child in p.children:
        if isinstance(child, str) and ';' in child:
            parts = child.split(';')
            current.append(parts[0])
            clauses.append(current)
            for mid in parts[1:-1]:
                clauses.append([mid])
            current = [parts[-1]]
        else:
            current.append(child)
    clauses.append(current)
    return clauses


def parse_transactions(path):
    """Basketball-Reference season transactions page -> acquisition records.
    -> [{bbrefId, name, date, method, toTeams, fromTeams, text, flags}]
    Source: basketball-reference.com/leagues/NBA_{season}_transactions.html

    toTeams/fromTeams are scoped per CLAUSE, not per paragraph — a
    multi-team trade names several teams in one sentence, but each player
    only actually moved between the two teams in their own clause (see
    _split_clauses). The pre-2026-08-07 version of this function collected
    every team mentioned anywhere in the whole paragraph into one flat list
    per player, which made every player in a 3+ team trade look ambiguous
    (unusable) even though the underlying markup unambiguously ties each
    player to their own from/to team.
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
            for clause in _split_clauses(p):
                tags = [n for n in clause if not isinstance(n, str)]
                # A separator is required here: BBRef's transaction sentences
                # interleave plain text with <a> links with no guaranteed
                # space at the boundary in the DOM, and get_text(strip=True)
                # strips each fragment individually — without a separator,
                # "The Warriors traded X" collapses into "TheWarriorstradedX",
                # which silently breaks classify_transaction's substring
                # checks (e.g. ' traded ').
                text = ' '.join(
                    (n if isinstance(n, str) else n.get_text(' ', strip=True)) for n in clause
                ).strip()
                text = re.sub(r'\s+', ' ', text)
                if not text:
                    continue
                to_teams = [a['data-attr-to'] for a in tags if a.name == 'a' and a.has_attr('data-attr-to')]
                from_teams = [a['data-attr-from'] for a in tags if a.name == 'a' and a.has_attr('data-attr-from')]
                if not any(t.name == 'a' and re.match(r'^/players/[a-z]/', t.get('href', '')) for t in tags):
                    continue
                method = classify_transaction(text)
                flags = ['BBREF_PLACEHOLDER'] if 'FROM_TRADE' in text else []
                # A single clause can describe a two-way swap in one sentence
                # — "the X traded [players] to the Y FOR [other players]" —
                # where the group after "for" moved the OPPOSITE direction
                # (what Y gave up in return), not the same to/from pair as
                # the group before it. Confirmed live 2026-08-07: Rob
                # Dillingham/Leonard Miller's trade to Chicago was recorded
                # as if they'd gone to Minnesota (the clause's nominal
                # to-team) because every player in a clause used to get the
                # same direction uniformly. Scoped to method=='trade' only —
                # "for" shows up in other prose (e.g. "signed for the
                # veteran minimum") where no direction-flip is meant, but
                # those clauses have no player link after it anyway; gating
                # on trade avoids relying on that coincidence.
                reversed_direction = False
                for node in clause:
                    if isinstance(node, str):
                        if method == 'trade' and re.search(r'\bfor\b', node):
                            reversed_direction = True
                        continue
                    if node.name == 'a' and re.match(r'^/players/[a-z]/', node.get('href', '')):
                        pid = node['href'].rsplit('/', 1)[-1].replace('.html', '')
                        player_to = from_teams if reversed_direction else to_teams
                        player_from = to_teams if reversed_direction else from_teams
                        out.append({
                            'bbrefId': pid,
                            'name': node.get_text(strip=True),
                            'date': date,
                            'dateRaw': date_raw,
                            'method': method,
                            'toTeams': player_to,
                            'fromTeams': player_from,
                            'text': text,
                            # BBRef occasionally mangles multi-team-trade markup into a
                            # literal "FROM_TRADE" placeholder. Flag for review, don't drop.
                            'flags': flags,
                        })
    if not out:
        raise RuntimeError('transactions parsed to zero rows — page layout changed')
    return out

