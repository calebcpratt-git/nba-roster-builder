"""Hoops Rumors: guarantee dates/status, trade kickers, no-trade clauses.

Four page types from one source, matching the multi-page-type-per-module
convention already used in bbref.py:
  - parse_guarantee_dates()        Early Salary Guarantee Dates article
  - parse_non_guaranteed_by_team() Non-Guaranteed Contracts By Team article
  - parse_trade_kickers()          Players With Trade Kickers article
  - parse_veto_trades()            Players Who Can Veto Trades article

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
