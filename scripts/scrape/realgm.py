"""RealGM future draft picks -> DraftPick records.

Implements the transformation spec in NBA_Draft_Pick_Transformation_Guide.docx.
Each table cell is a sequence of true lines (HTML <p>/<br> boundaries — NOT a
single string split on punctuation), the last of which is a count indicator.
Steps below mirror the guide's numbering.
"""
from bs4 import BeautifulSoup
import re

REALGM_TO_NAME = {
    'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BRK': 'Brooklyn Nets',
    'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
    'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
    'GOS': 'Golden State Warriors', 'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
    'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers', 'MEM': 'Memphis Grizzlies',
    'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks', 'MIN': 'Minnesota Timberwolves',
    'NOP': 'New Orleans Pelicans', 'NYK': 'New York Knicks', 'OKC': 'Oklahoma City Thunder',
    'ORL': 'Orlando Magic', 'PHL': 'Philadelphia Sixers', 'PHX': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings', 'SAN': 'San Antonio Spurs',
    'TOR': 'Toronto Raptors', 'UTH': 'Utah Jazz', 'WAS': 'Washington Wizards',
}
CODE = '|'.join(REALGM_TO_NAME)
COND_WORDS = re.compile(r'\bif\b|not already settled|potential|conveyed', re.I)

# ---------- Step 1 / line extraction ----------

def _split_by_br(tag):
    lines, buf = [], ''
    for node in tag.descendants:
        if getattr(node, 'name', None) == 'br':
            lines.append(buf.strip()); buf = ''
        elif isinstance(node, str):
            buf += node
    lines.append(buf.strip())
    return [l for l in lines if l]


def load_sections(path):
    """-> [{team, year, round, lines}] — 'lines' preserves true <p>/<br> boundaries."""
    soup = BeautifulSoup(open(path, encoding='ISO-8859-1', errors='replace').read(), 'html.parser')
    out = []
    for table in soup.find_all('table'):
        heading = table.find_previous(['h2', 'h3'])
        team = heading.get_text(strip=True).replace(' Future NBA Draft Picks', '') if heading else None
        if team not in REALGM_TO_NAME.values():
            continue
        body = table.find('tbody')
        if body is None:
            continue
        for tr in body.find_all('tr'):
            tds = tr.find_all('td')
            if len(tds) < 3:
                continue
            year_txt = tds[0].get_text(strip=True)
            if not year_txt.isdigit():
                continue
            for rnd, td in (('First Round', tds[1]), ('Second Round', tds[2])):
                lines = []
                for p in td.find_all('p'):
                    lines += _split_by_br(p)
                out.append({'team': team, 'year': int(year_txt), 'round': rnd, 'lines': lines})
    if not out:
        raise RuntimeError('RealGM parsed to zero sections — page layout changed')
    return out


def _pop_count(lines):
    """Last line is the count ('1', '2', '1 + 1'). Returns (content_lines, (guaranteed, conditional))."""
    if not lines:
        return [], (0, 0)
    m = re.match(r'^(\d+)(?:\s*\+\s*(\d+))?$', lines[-1].strip())
    if not m:
        return lines, (None, None)     # unexpected shape — caller flags for review
    g = int(m.group(1))
    c = int(m.group(2)) if m.group(2) else 0
    return lines[:-1], (g, c)


# ---------- per-line skip / classification helpers ----------

_SKIP_LINE = re.compile(
    r'^\[.*\]$'                              # bracket-only annotation
    r'|^\*'                                  # asterisk footnote
    r'|^\(via.*\)\.?$'                       # via-only continuation line (long via lists wrap
                                              # onto their own <p> in the source; always ignored)
    r'|^\d{1,2}\s*-\s*\d{1,2}\s+Own\b'       # digit-range Own (handled in step 5/8 pairing only)
    r'|^or\s+\d{1,2}\s*-\s*\d{1,2}\s+Own\b'  # "or X-Y Own"
    , re.I)
_VIA = re.compile(r'\s*\(via[^)]*\)', re.I)


def _strip_via(s):
    return _VIA.sub('', s).strip().rstrip(';').strip()


def _full(code):
    return REALGM_TO_NAME.get(code)


# ---------- Step 2: Own ----------
_OWN_PLAIN = re.compile(r'^Own\s*(\(via[^)]*\))?;?$', re.I)
_OWN_NUM = re.compile(r'^Own\s*#(\d+)$', re.I)


def _match_own(line, section_team, year):
    if 'swap' in line.lower() and re.search(r'\bown or\b', line, re.I):
        return None   # step 6/7 territory, not step 2
    m = _OWN_NUM.match(line)
    if m:
        return {'teamOwner': section_team, 'pickNumber': int(m.group(1)) if year == 2026 else None}
    if _OWN_PLAIN.match(line):
        return {'teamOwner': section_team}
    return None


# ---------- Step 3: simple incoming ----------
_INCOMING_PLAIN = re.compile(rf'^({CODE})\s*(\(via[^)]*\))?;?$')
_INCOMING_NUM = re.compile(rf'^({CODE})\s*#(\d+)$')


def _match_incoming(line, section_team, year):
    if re.search(r'\d{1,2}\s*-\s*\d{1,2}', line) or COND_WORDS.search(line) or '(Own)' in line:
        return None
    m = _INCOMING_NUM.match(line)
    if m:
        return {'teamOwner': section_team, 'teamFrom': _full(m.group(1)),
                'pickNumber': int(m.group(2)) if year == 2026 else None}
    m = _INCOMING_PLAIN.match(line)
    if m:
        return {'teamOwner': section_team, 'teamFrom': _full(m.group(1))}
    return None


# ---------- Step 4: simple range/protection ----------
_RANGE_INCOMING = re.compile(rf'^({CODE})\s+(\d{{1,2}}\s*-\s*\d{{1,2}})\s*(\(via[^)]*\))?;?$')


def _match_range(line, section_team):
    if COND_WORDS.search(line):
        return None
    m = _RANGE_INCOMING.match(line)
    if m:
        return {'teamOwner': section_team, 'teamFrom': _full(m.group(1)),
                'protections': m.group(2).replace(' ', '')}
    return None


# ---------- Step 6/7: swap lines ----------
_SWAP_FOR = re.compile(rf'^Own or swap for\s+({CODE})\b', re.I)
_SWAP_QUEUE = re.compile(rf'^Own or\s+({CODE})\s*\(via\s+({CODE})\s+swap for[^)]*\)', re.I)


def _match_swap_for(line, section_team):
    if re.match(r'^\d', line):
        return None    # digit-range prefix -> paired with step 8, not standalone
    m = _SWAP_FOR.match(line)
    if m:
        return {'teamOwner': section_team, 'swapOption': _full(m.group(1))}
    return None


def _match_swap_queue(line, section_team):
    m = _SWAP_QUEUE.match(line)
    if m:
        return {'teamOwner': section_team, 'swapOwner': _full(m.group(1))}
    return None


# ---------- Step 9: conditional incoming ----------
_COND_INCOMING = re.compile(rf'^({CODE})\b')


def _match_conditional(line, section_team):
    """Step 9 is scoped to lines that NAME a source team ('TEAM if ...'). A
    conditional clause with no leading team code (e.g. a multi-team ranking
    with an embedded 'if') is step 12's territory, not this step's."""
    if not COND_WORDS.search(line):
        return None
    m = _COND_INCOMING.match(line)
    if not m:
        return None
    return {'teamOwner': section_team, 'teamFrom': _full(m.group(1)), 'protections': line}


# ---------- Step 10: frozen ----------
_FROZEN = re.compile(r'^Frozen\s*\(through\s+([\d-]+)\)', re.I)


def _match_frozen(line, section_team):
    m = _FROZEN.match(line)
    if m:
        return {'teamOwner': section_team, 'protections': f'Frozen through {m.group(1)}'}
    return None


# ---------- Step 11: simple two-team favorable/least-favorable ----------
_MORE_FAV = re.compile(rf'^(More|Most) favorable of ({CODE}) and ({CODE})$', re.I)
_LESS_FAV = re.compile(rf'^(Less|Least) favorable of ({CODE}) and ({CODE})$', re.I)


def _match_simple_favorable(line, section_team):
    if re.search(r'second most|third most|\(i\)|\(ii\)|then other to', line, re.I):
        return None   # step 12 territory
    m = _MORE_FAV.match(line)
    if m:
        return {'teamOwner': section_team, 'swapOption': f'{_full(m.group(2))}, {_full(m.group(3))}'}
    m = _LESS_FAV.match(line)
    if m:
        return {'teamOwner': section_team, 'swapOwner': f'{_full(m.group(2))}, {_full(m.group(3))}'}
    return None


# ---------- Step 12: complex multi-team ranking (fallback) ----------
_POOL_TEAM = re.compile(rf'\b({CODE})\b(\s+\d{{1,2}}\s*-\s*\d{{1,2}})?')


def _pool_and_rank(line):
    pool = []
    for code, rng in _POOL_TEAM.findall(line):
        val = f'{_full(code)}{rng}' if rng else _full(code)
        if val not in pool:
            pool.append(val)
    return pool, line


def _match_complex(line, section_team):
    pool, rank = _pool_and_rank(line)
    return {'teamOwner': section_team, 'pickPool': ', '.join(pool), 'rank': rank}


# ---------- Step 5 & 8: range-pair and protected-swap pairing within a cell ----------
_OWN_RANGE = re.compile(r'^(\d{1,2}\s*-\s*\d{1,2})\s+Own\b')
_TO_RANGE = re.compile(rf'^(\d{{1,2}}\s*-\s*\d{{1,2}})\s+to\s+({CODE})\b')
_OWN_RANGE_SWAP = re.compile(rf'^(\d{{1,2}}\s*-\s*\d{{1,2}})\s+Own or\s+({CODE})\s*\(via\s+(?:{CODE})\s+swap for[^)]*\)', re.I)


def _pair_rows(section_team, year, round_, lines):
    """Handles step 5 (own-range + to-range) and step 8 (range-protected swap)."""
    rows = []
    own_range = next((m.group(1) for l in lines if (m := _OWN_RANGE.match(l))), None)
    to_ranges = [(m.group(1), m.group(2)) for l in lines if (m := _TO_RANGE.match(l))]
    swap_range = next((m for l in lines if (m := _OWN_RANGE_SWAP.match(l))), None)

    if own_range and to_ranges:
        for to_range, recipient in to_ranges:
            rows.append({'teamOwner': section_team, 'year': year, 'round': round_,
                        'protections': f'{to_range.replace(" ", "")} to {_full(recipient)}'})
            rows.append({'teamOwner': _full(recipient), 'year': year, 'round': round_,
                        'teamFrom': section_team,
                        'protections': f'{own_range.replace(" ", "")} to {section_team}'})
    elif len(to_ranges) >= 2 and not own_range:
        for to_range, recipient in to_ranges:
            rows.append({'teamOwner': _full(recipient), 'year': year, 'round': round_,
                        'teamFrom': section_team, 'protections': f'{to_range.replace(" ", "")}'})

    if own_range and swap_range:
        rng, swap_code = swap_range.group(1), swap_range.group(2)
        rows.append({'teamOwner': section_team, 'year': year, 'round': round_,
                    'swapOwner': _full(swap_code), 'protections': own_range.replace(' ', '')})
    return rows


# ---------- driver ----------

MATCHERS_SIMPLE = [_match_own, _match_incoming, _match_range,
                   _match_swap_for, _match_swap_queue, _match_conditional, _match_frozen,
                   _match_simple_favorable]


def parse_picks(path):
    """-> (picks, stats). Every line becomes a row -- nothing is withheld for
    manual review. When a cell's count line doesn't reconcile with the number
    of candidate rows, the inference rule below still applies (it improves the
    guess), but whatever comes out after that is written as-is: these fields
    are read-only display text in the app (pickPool/rank especially), so a
    best-effort row is more useful to a user than a missing one."""
    picks = []
    unreconciled = 0
    sections = load_sections(path)
    for sec in sections:
        content, (g, c) = _pop_count(sec['lines'])
        if g is None:
            continue     # count line itself didn't parse -- nothing to build a row from
        team, year, round_ = sec['team'], sec['year'], sec['round']

        # pairing steps consume specific lines; run first, remove what they used
        paired = _pair_rows(team, year, round_, content)
        used_own_range = any(_OWN_RANGE.match(l) for l in content)
        used_to_range = any(_TO_RANGE.match(l) for l in content)
        used_swap_range = any(_OWN_RANGE_SWAP.match(l) for l in content)

        rows = []
        for row in paired:
            row.setdefault('year', year); row.setdefault('round', round_)
            rows.append(row)

        for line in content:
            if _SKIP_LINE.match(line):
                continue
            if line.startswith('To '):
                continue
            if used_own_range and _OWN_RANGE.match(line):
                continue
            if used_to_range and _TO_RANGE.match(line):
                continue
            if used_swap_range and _OWN_RANGE_SWAP.match(line):
                continue

            match = (_match_own(line, team, year)
                     or _match_incoming(line, team, year)
                     or _match_range(line, team)
                     or _match_swap_for(line, team)
                     or _match_swap_queue(line, team)
                     or _match_conditional(line, team)
                     or _match_frozen(line, team)
                     or _match_simple_favorable(line, team)
                     or _match_complex(line, team))
            match.setdefault('year', year)
            match.setdefault('round', round_)
            match['_srcLine'] = line
            rows.append(match)

        # Inference rule (guide, "Inference Rules"): when a cell yields more
        # candidate rows for the section's own team than its count line
        # allows, a line ending "...to TEAM" describes where the OTHER share
        # of a shared pick goes, not what this team receives. Drop those
        # first -- this is best-guess narrowing, not a correctness gate.
        own_count = sum(1 for r in rows if r.get('teamOwner') == team)
        if (g + c) > 0 and own_count > g + c:
            ends_elsewhere = re.compile(r'to\s+(?:' + CODE + r')\s*(\(via[^)]*\))?;?$', re.I)
            keep = [r for r in rows
                    if not (r.get('teamOwner') == team and ends_elsewhere.search(r.get('_srcLine', '')))]
            trial_own = sum(1 for r in keep if r.get('teamOwner') == team)
            if trial_own >= min(g + c, own_count):
                rows = keep

        own_rows = [r for r in rows if r.get('teamOwner') == team]
        if (g + c) > 0 and len(own_rows) != g + c:
            unreconciled += 1
        picks.extend(rows)

    FIELDS = ['teamOwner', 'year', 'round', 'teamFrom', 'swapOwner', 'swapOption',
              'protections', 'pickNumber', 'pickPool', 'rank']
    out = [{f: p.get(f) for f in FIELDS} for p in picks]
    return out, {'sections': len(sections), 'unreconciled': unreconciled}
