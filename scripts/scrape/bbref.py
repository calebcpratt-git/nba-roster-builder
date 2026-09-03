"""Basketball Reference: draft classes, season transactions, and awards.
(The player-contracts page — salary/team/options — and the per-player bio-page
draft-year fallback were both retired in the 2026-09 migration to
SalarySwish's /teams/{slug} rosters; see salaryswish.py's parse_team_roster
and run.py's build_players.)"""
from bs4 import BeautifulSoup
from datetime import datetime
import re

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'


def _soup(path):
    return BeautifulSoup(open(path, encoding='utf-8', errors='replace').read(), 'html.parser')


def _player_id(cell):
    pid = cell.get('data-append-csv')
    if pid:
        return pid
    a = cell.find('a', href=re.compile(r'/players/'))
    return a['href'].rsplit('/', 1)[-1].replace('.html', '') if a else None


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

