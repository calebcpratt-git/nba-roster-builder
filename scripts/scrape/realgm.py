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


# A line's via-chain names every team the pick's rights ever passed through en
# route to its current state, but only the team(s) named in a leading
# "[TEAM may convey to TEAM]" / "[TEAM can swap with TEAM]" annotation can
# actually end up owning it. Without this, RealGM republishing the same
# compound-chain note on every entangled team's own page (PHI, LAC, IND, MIA,
# OKC, UTH, SAN, HOU, DET, NYK, NOP, ...) mints a teamOwner row for each of
# them, even though e.g. IND was only ever a pass-through link, not a
# candidate recipient.
_CONVEY_ELIGIBLE = re.compile(
    rf'^\[({CODE})\s+(?:may|can|will)\s+convey(?:\s+({CODE}))?\s+to\s+({CODE})', re.I)
_SWAP_ELIGIBLE = re.compile(
    rf'^\[({CODE})\s+can\s+(?:then\s+)?swap\s+with\s+({CODE})\]', re.I)


def _eligible_owners(line):
    """Parse a leading bracket annotation for the real set of possible
    recipients. Returns None when the line carries no such annotation --
    nothing to restrict on, so the old unrestricted behavior applies."""
    m = _CONVEY_ELIGIBLE.match(line) or _SWAP_ELIGIBLE.match(line)
    if not m:
        return None
    return {_full(c) for c in m.groups() if c}


def _match_complex(line, section_team):
    eligible = _eligible_owners(line)
    if eligible is not None and section_team not in eligible:
        return None
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
            if match is None:
                continue    # complex line named a bracket that excludes this team
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


# ---------- free-agent-options / current-free-agents (stale-option reconciliation) ----------

# REALGM_TO_NAME's own key set isn't quite what these two pages use: the
# future_drafts page's headings are consistent with REALGM_TO_NAME's keys, but
# free_agent_options' "Current Team" column spells out the full name directly
# (already matches REALGM_TO_NAME.values()), and current_free_agents' "Prior
# NBA Team" column uses a THIRD code variant for a few teams (confirmed live:
# SAS/UTA there, vs. SAN/UTH in REALGM_TO_NAME) alongside CHA/GOS/PHL/PHX
# which do match REALGM_TO_NAME's keys. None of these three pages' codes are
# the app's own bbref-style abbreviations (CHO not CHA, GSW not GOS, PHI not
# PHL, PHO not PHX) used in players.json's `team` field, so both need mapping
# through to the app abbreviation before they can be compared to it.
_APP_ABBR_OVERRIDES = {'CHA': 'CHO', 'GOS': 'GSW', 'PHL': 'PHI', 'PHX': 'PHO', 'SAN': 'SAS', 'UTH': 'UTA'}
REALGM_CODE_TO_APP_ABBR = {code: _APP_ABBR_OVERRIDES.get(code, code) for code in REALGM_TO_NAME}
REALGM_NAME_TO_APP_ABBR = {name: REALGM_CODE_TO_APP_ABBR[code] for code, name in REALGM_TO_NAME.items()}
# current_free_agents' "Prior NBA Team" column additionally uses SAS/UTA
# directly (not SAN/UTH) — extend rather than replace the code map above.
_PRIOR_TEAM_TO_APP_ABBR = {**REALGM_CODE_TO_APP_ABBR, 'SAS': 'SAS', 'UTA': 'UTA'}

_SEASON_RANGE = re.compile(r'^(\d{4})-(\d{4})$')


def _normalize_season(text):
    """'2027-2028' -> '2027-28', matching CURRENT_SEASON_LABEL's format."""
    m = _SEASON_RANGE.match(text.strip())
    if not m:
        return None
    return f'{m.group(1)}-{m.group(2)[-2:]}'


def parse_free_agent_options(path):
    """-> [{name, position, team, season, optionType}]
    Parses the free_agent_options table (Player / Pos / Current Team / Season
    / Option Type / ...). `season` is normalized to the 'YYYY-YY' label format
    already used elsewhere in the pipeline (matches CURRENT_SEASON_LABEL in
    run.py) so it can be directly compared to players.json's options dict
    keys. `position` is the raw Pos column value, None if blank."""
    soup = BeautifulSoup(open(path, encoding='ISO-8859-1', errors='replace').read(), 'html.parser')
    table = None
    for t in soup.find_all('table'):
        header_cells = [c.get_text(strip=True) for c in t.find_all(['th', 'td'])[:5]]
        if header_cells[:3] == ['Player', 'Pos', 'Current Team']:
            table = t
            break
    if table is None:
        raise RuntimeError('free_agent_options table not found — page layout changed')
    body = table.find('tbody')
    if body is None:
        raise RuntimeError('free_agent_options table has no tbody — page layout changed')
    out = []
    for tr in body.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) < 5:
            continue
        name = tds[0].get_text(strip=True)
        position = tds[1].get_text(strip=True) or None
        team_name = tds[2].get_text(strip=True)
        season = _normalize_season(tds[3].get_text(strip=True))
        option_type = tds[4].get_text(strip=True)
        team = REALGM_NAME_TO_APP_ABBR.get(team_name)
        if not name or team is None or season is None or not option_type:
            continue
        out.append({'name': name, 'position': position, 'team': team, 'season': season,
                     'optionType': option_type})
    if not out:
        raise RuntimeError('free_agent_options parsed to zero rows — page layout changed')
    return out


_VETERAN_FA_STATUS_TO_BIRD_RIGHTS = {
    'Non-Bird': 'non-bird', 'Early Bird': 'early-bird', 'Bird': 'full-bird',
}


def parse_current_free_agents(path):
    """-> [{name, position, priorTeam, faType, birdRights}]
    Parses the current_free_agents table (Player / Pos / ... / FA Type /
    Veteran FA Status / Prior NBA Team / ...). faType is the raw column value
    ('U' unrestricted, 'R' restricted, etc.) — kept as-is, not interpreted
    here. birdRights is mapped from the "Veteran FA Status" column
    ('Non-Bird' / 'Early Bird' / 'Bird') to the app's lowercase-hyphenated
    form; None when the column reads 'N/A' (no NBA veteran service) or the
    column itself is missing from an older page layout. position is the raw
    Pos column value, None if blank or the column is missing."""
    soup = BeautifulSoup(open(path, encoding='ISO-8859-1', errors='replace').read(), 'html.parser')
    table = None
    for t in soup.find_all('table'):
        header_cells = [c.get_text(strip=True) for c in t.find_all(['th', 'td'])[:15]]
        if 'FA Type' in header_cells and 'Prior NBA Team' in header_cells:
            table = t
            header = header_cells
            break
    if table is None:
        raise RuntimeError('current_free_agents table not found — page layout changed')
    body = table.find('tbody')
    if body is None:
        raise RuntimeError('current_free_agents table has no tbody — page layout changed')
    fa_type_idx = header.index('FA Type')
    prior_team_idx = header.index('Prior NBA Team')
    bird_idx = header.index('Veteran FA Status') if 'Veteran FA Status' in header else None
    pos_idx = header.index('Pos') if 'Pos' in header else None
    out = []
    for tr in body.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) <= max(fa_type_idx, prior_team_idx):
            continue
        name = tds[0].get_text(strip=True)
        fa_type = tds[fa_type_idx].get_text(strip=True)
        prior_team_code = tds[prior_team_idx].get_text(strip=True)
        prior_team = _PRIOR_TEAM_TO_APP_ABBR.get(prior_team_code)
        if not name or prior_team is None or not fa_type:
            continue
        bird_rights = None
        if bird_idx is not None and len(tds) > bird_idx:
            bird_rights = _VETERAN_FA_STATUS_TO_BIRD_RIGHTS.get(tds[bird_idx].get_text(strip=True))
        position = None
        if pos_idx is not None and len(tds) > pos_idx:
            position = tds[pos_idx].get_text(strip=True) or None
        out.append({'name': name, 'position': position, 'priorTeam': prior_team, 'faType': fa_type,
                     'birdRights': bird_rights})
    if not out:
        raise RuntimeError('current_free_agents parsed to zero rows — page layout changed')
    return out
