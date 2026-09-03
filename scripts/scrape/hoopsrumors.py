"""Hoops Rumors: guarantee dates/status, trade kickers, no-trade clauses,
cash-in-trade ledgers.

Five page types from one source, matching the multi-page-type-per-module
convention already used in bbref.py:
  - parse_guarantee_dates()        Early Salary Guarantee Dates article
  - parse_non_guaranteed_by_team() Non-Guaranteed Contracts By Team article
  - parse_trade_kickers()          Players With Trade Kickers article
  - parse_veto_trades()            Players Who Can Veto Trades article
  - parse_cash_in_trade()          Cash Sent, Received In NBA Trades article

(parse_two_way_tracker() was retired in the 2026-09 SalarySwish-rosters
migration — two-way contracts are now a native roster section, sourced
directly with everyone else, so this tracker's team-correction/creation job
no longer has anything to do.)

These are hand-written blog posts, not tabular data-stat markup like BBRef.
Player names sit inside nested <strong><a> tags immediately followed by
plain-text detail ("(Team): ..."), so a get_text(' ', strip=True) — a space
separator, not '\\n' — is used to reconstruct each block element as one
line; get_text(strip=True) with no separator silently glues adjacent words
together at tag boundaries (e.g. "TheWarriorstraded..."), and a '\\n'
separator instead splits one logical entry into several fragments that no
longer match a single-line regex. Verified against live pages before writing
this — see the three regex modules below.
"""
from bs4 import BeautifulSoup, NavigableString
import re

MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
DATE_HDR = re.compile(rf'^({MONTHS})\s+(\d{{1,2}})$')
MONEY = re.compile(r'\$([\d,]+)')
ENTRY = re.compile(r'^(.+?)\s*\((.+?)\)\s*:\s*(.+?)$')
KICKER_LINE = re.compile(r'^(.+?),\s*(\S.*?)\s*\(([\d.]+)%(?:\s*(?:or)\s*\$([\d,]+)[^)]*)?\)\s*(:\s*(.+))?$')
NAME_TEAM = re.compile(r'^(.+?)\s*\((.+?)\)(:\s*(.+))?$')

# Hoops Rumors writes out full team names ("Atlanta Hawks") on the cash-ledger
# page — none of this module's other parsers have needed a name->abbr mapping
# before (guarantee/kicker/veto records match by PLAYER name only), so this is
# a new one, verified against all 30 <h3> headers on a live page.
HR_TEAM_NAME_TO_ABBR = {
    'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BRK',
    'Charlotte Hornets': 'CHO', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
    'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
    'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
    'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
    'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
    'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
    'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHO',
    'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS',
    'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
}


def _soup(path):
    return BeautifulSoup(open(path, encoding='utf-8', errors='replace').read(), 'html.parser')


def _entry(path):
    entry = _soup(path).find('div', class_='entry-content')
    if entry is None:
        raise RuntimeError('entry-content div not found — page layout changed')
    return entry


def _entry_lines(path):
    """One line per top-level <p>/<li>/<h1-4> in the entry-content div."""
    lines = []
    for el in _entry(path).find_all(['p', 'li', 'h1', 'h2', 'h3', 'h4']):
        line = re.sub(r'\s+', ' ', el.get_text(' ', strip=True)).strip()
        if line:
            lines.append(line)
    return lines


def _money(s):
    return [int(x.replace(',', '')) for x in MONEY.findall(s)]


def parse_guarantee_dates(path, season_year):
    """-> [{player, team, guaranteeDate (ISO), status, partialAmount, fullAmount,
             guaranteeTriggered, raw}]"""
    lines = _entry_lines(path)
    months = MONTHS.split('|')
    out = []
    cur_date = None
    for ln in lines:
        d = DATE_HDR.match(ln)
        if d:
            month_num = months.index(d.group(1)) + 1
            cur_date = f'{season_year}-{month_num:02d}-{int(d.group(2)):02d}'
            continue
        if cur_date is None:
            continue
        e = ENTRY.match(ln)
        if not e:
            continue
        player, team, desc = e.group(1).strip(), e.group(2).strip(), e.group(3).strip()
        if len(player) > 40 or any(c in player for c in '.!?'):
            continue
        low = desc.lower()
        amounts = _money(desc)
        if 'non-guaranteed' in low:
            status, partial, full = 'non-guaranteed', 0, (amounts[0] if amounts else None)
        elif 'partial guarantee' in low:
            # Covers both "...increases to full guarantee ($Y)" and the rarer
            # "...increases to $Y" phrasing (a step up to a bigger, still
            # partial, guarantee on this date rather than to full) — either
            # way the player is 'partial' as of today, which is what
            # SeasonGuarantee.status needs; "full guarantee" is not required.
            status = 'partial'
            partial = amounts[0] if amounts else None
            full = amounts[1] if len(amounts) > 1 else None
        else:
            status = 'unknown'
            partial = amounts[0] if amounts else None
            full = amounts[1] if len(amounts) > 1 else None
        triggered = True if '✅' in desc else (False if '❌' in desc else None)
        out.append({
            'player': player, 'team': team, 'guaranteeDate': cur_date,
            'status': status, 'partialAmount': partial, 'fullAmount': full,
            'guaranteeTriggered': triggered, 'raw': desc,
        })
    if not out:
        raise RuntimeError('guarantee-dates parsed to zero rows — page layout changed')
    return out


def parse_non_guaranteed_by_team(path):
    """-> [{player, team, fullAmount, partialAmount, status, exhibit10}]

    Team sections are h3 headers ("Atlanta Hawks") followed by a <ul> of
    player <li>s. A player with a partial guarantee has the amount in a
    NESTED <ul><li> ("Partially guaranteed for $X.") inside their own <li> —
    that nested <li> must be excluded from the top-level line walk (else it
    reads as a second, empty-named player) and its text read separately from
    the player's own direct text (else the two get glued into one line and
    the "startswith" check that would normally catch it never fires).
    """
    entry = _entry(path)
    out = []
    cur_team = None
    for el in entry.find_all(['h3', 'li']):
        if el.name == 'li' and el.find_parent('li') is not None:
            continue  # nested partial-guarantee sub-item; folded into the parent below
        if el.name == 'h3':
            cur_team = el.get_text(strip=True)
            continue
        if cur_team is None:
            continue
        own_parts = []
        nested_ul = None
        for child in el.children:
            if isinstance(child, NavigableString):
                own_parts.append(str(child))
            elif child.name == 'ul':
                nested_ul = child
            else:
                own_parts.append(child.get_text(' ', strip=True))
        own_text = re.sub(r'\s+', ' ', ' '.join(own_parts)).strip()
        if own_text == 'None' or not own_text:
            continue
        amt = _money(own_text)
        name = re.sub(r'\(\$[\d,]+\)', '', own_text).replace('*', '').strip()
        rec = {
            'player': name, 'team': cur_team,
            'fullAmount': amt[0] if amt else None, 'partialAmount': None,
            'status': 'non-guaranteed', 'exhibit10': '*' in own_text,
        }
        if nested_ul is not None:
            partial_amt = _money(nested_ul.get_text(' ', strip=True))
            if partial_amt:
                rec['partialAmount'] = partial_amt[0]
                rec['status'] = 'partial'
        out.append(rec)
    if not out:
        raise RuntimeError('non-guaranteed-by-team parsed to zero rows — page layout changed')
    return out


def parse_trade_kickers(path):
    """-> [{player, team, kickerPercent, kickerFixedAmount, note, section}]
    section: 'active' | 'voided_at_max' | 'future_extension'"""
    lines = _entry_lines(path)
    section = 'active'
    out = []
    for ln in lines:
        low = ln.lower()
        if 'voided' in low and 'maximum salary' in low:
            section = 'voided_at_max'
            continue
        # Checked without relying on the apostrophe in "won't" — HR's copy
        # uses a curly '’' that doesn't match a straight-quote literal.
        if 'extension' in low and 'go into effect' in low:
            section = 'future_extension'
            continue
        m = KICKER_LINE.match(ln)
        if not m:
            continue
        player, team, pct, fixed_amt, _, note = m.groups()
        out.append({
            'player': player.strip(), 'team': team.strip(),
            'kickerPercent': float(pct),
            'kickerFixedAmount': int(fixed_amt.replace(',', '')) if fixed_amt else None,
            'note': note.strip() if note else None,
            'section': section,
        })
    if not out:
        raise RuntimeError('trade-kickers parsed to zero rows — page layout changed')
    return out


def parse_veto_trades(path):
    """-> {explicitNoTradeClause: [...], implicitVetoOneYearBird: [...], waivedImplicitVeto: [...]}
    Each entry: {player, team, note}. The three groups matter to trade logic:
    explicit NTCs are hard vetoes; implicit ones are far more commonly waived."""
    lines = _entry_lines(path)
    out = {'explicitNoTradeClause': [], 'implicitVetoOneYearBird': [], 'waivedImplicitVeto': []}
    section = None
    for ln in lines:
        low = ln.lower()
        if 'players with a no-trade clause' in low:
            section = 'explicitNoTradeClause'
            continue
        if 'forfeit' not in low and (
            're-signed for one year' in low or 'second-year player/team option' in low
        ):
            section = 'implicitVetoOneYearBird'
            continue
        if 'agreed to forfeit their right to veto' in low:
            section = 'waivedImplicitVeto'
            continue
        if section is None:
            continue
        m = NAME_TEAM.match(ln)
        if not m:
            continue
        player, team, _, note = m.groups()
        if len(player) > 40:
            continue
        out[section].append({'player': player.strip(), 'team': team.strip(),
                              'note': note.strip() if note else None})
    if not any(out.values()):
        raise RuntimeError('veto-trades parsed to zero rows — page layout changed')
    return out


def parse_cash_in_trade(path):
    """-> [{team, availableToSend, availableToReceive}]
    Verified against a live page: each team is an <h3> header followed by a
    <ul> with exactly two top-level <li>s — "Cash available to send: $X" and
    "Cash available to receive: $Y" — each wrapping its own nested <ul> of
    per-transaction detail ("Sent $A to Team.") this function doesn't need.
    Reads only the top-level <li>'s <strong> dollar figure, not the nested
    list, so it never has to distinguish "available" running-balance lines
    from individual transaction lines."""
    entry = _entry(path)
    out = []
    for h3 in entry.find_all('h3'):
        team = h3.get_text(strip=True)
        ul = h3.find_next_sibling('ul')
        if ul is None:
            continue
        rec = {'team': team}
        for li in ul.find_all('li', recursive=False):
            strong = li.find('strong')
            if strong is None:
                continue
            amt = _money(strong.get_text(strip=True))
            if not amt:
                continue
            label = li.get_text(' ', strip=True).lower()
            if 'available to send' in label:
                rec['availableToSend'] = amt[0]
            elif 'available to receive' in label:
                rec['availableToReceive'] = amt[0]
        if 'availableToSend' in rec or 'availableToReceive' in rec:
            out.append(rec)
    if not out:
        raise RuntimeError('cash-in-trade parsed to zero rows — page layout changed')
    return out


