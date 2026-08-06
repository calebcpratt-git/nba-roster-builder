"""SalarySwish.com: held trade exceptions, hard-cap status, and per-player
signing-exception type + likely/unlikely incentive amounts.

Added per the July 2026 sourcing review of the six "no identified source"
CBA fields. SalarySwish (the independent CapFriendly-team successor, launched
Sept 2023) is the only public, non-Spotrac source found for these three.
Cash-in-trade ledgers are sourced from Hoops Rumors instead (see
hoopsrumors.py); the "apron addon" gap is since closed too, derived from
this module's own unlikely-incentive data — see run.py's build_apron_addon.

Confirmed live (July 2026) that the site is genuinely static server-rendered
HTML: no __NEXT_DATA__, no self.__next_f.push hydration payload (unlike
nbacaptracker.com) — a plain fetch + BeautifulSoup is enough, no JSON
extraction needed. Two independent single-page trackers cover all 30 teams:
  /trade-exception    -> held TPEs league-wide
  /hard-cap-tracker   -> which teams are hard-capped and why, league-wide

IMPORTANT — the tracker table's data-sort-end_date attribute is a site bug:
verified against a live page that it is always identical to
data-sort-start_date for every row (61/61 on the date this was checked), even
though the visible "End Date" column text is correct (one year after Start
Date, matching a TPE's real 1-year life). Parse the rendered "Start Date" /
"End Date" <td> text, never the data-sort-* attributes, or every TPE's
expiration will silently read as its creation date.

Per-player signing-method/incentive data is NOT available on team or league
pages — only on individual /players/{slug} pages, one fetch per player
(~475 across the league). To respect "small independent site, cache
aggressively" (this is a two-person indie tracker, not a data API), run.py's
build_signing_incentives() only (re)fetches a player when they're new to the
cache or their team changed since the last run — see that function, not this
module, for the caching policy.
"""
import os
import re
import time
import random
import unicodedata
import urllib.request
import urllib.error
from datetime import datetime

from bs4 import BeautifulSoup

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'
MIN_BYTES = 5_000
FETCH_TRIES = 3
BACKOFF_BASE = 3

TRADE_EXCEPTION_URL = 'https://salaryswish.com/trade-exception'
HARD_CAP_URL = 'https://salaryswish.com/hard-cap-tracker'
PLAYER_URL = 'https://salaryswish.com/players/{slug}'
SITEMAP_URL = 'https://salaryswish.com/sitemap.xml'

# SalarySwish's own 3-letter codes differ from this app's in three spots —
# the same two nbacaptracker's SLUG_TO_ABBR already has (captracker.py:
# Charlotte, Brooklyn), plus Phoenix, which nbacaptracker didn't need mapping
# for but SalarySwish's tables render as PHX against the app's PHO. Verified
# directly: the hard-cap tracker returned 18 unique team codes but only 17
# matched an existing team-cap-state row until this was added.
TEAM_TO_ABBR = {'CHA': 'CHO', 'BKN': 'BRK', 'PHX': 'PHO'}


def to_app_abbr(code):
    return TEAM_TO_ABBR.get(code, code)


def slugify(name):
    """-> SalarySwish's /players/{slug} form. Verified against ~15 live
    slugs incl. suffixes (kelly-oubre-jr), initials (og-anunoby, pj-washington),
    apostrophes (naeqwan-tomlin from "Nae'Qwan Tomlin"), and accents
    (edin-bavcic from "Edin Bavčić") — same NFKD-strip approach as run.py's
    _base(), but keeps suffixes (jr/sr/ii/iii/iv) and joins with hyphens
    instead of folding to spaces, since the slug needs to disambiguate."""
    n = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    n = n.lower().replace("'", '').replace('.', '')
    n = re.sub(r'[^a-z0-9]+', '-', n).strip('-')
    return n


def squash(text):
    """Lowercase, accent-stripped, alphanumeric-only — no hyphens/spaces at
    all. Used to match a player name against a SalarySwish slug regardless
    of how inconsistently the site hyphenates compound surnames and Jr/Sr/II
    suffixes (verified live: 'Jaren Jackson Jr.' -> /players/jaren-jacksonjr,
    but 'Andre Jackson Jr.' -> /players/andre-jackson-jr; 'Shai
    Gilgeous-Alexander' -> /players/shai-gilgeousalexander). Squashing both
    sides to the same bare alphanumeric string sidesteps the inconsistency
    instead of trying to special-case it in slugify()."""
    n = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]', '', n.lower())


# SalarySwish indexes a handful of players under their full legal name or a
# suffix our data doesn't carry, rather than the common name BBRef/our app
# uses — squash() alone can't bridge that gap (it's not a formatting
# difference, it's a different name/suffix). Keyed by squash(our name) ->
# squash(their name); verified against live sitemap.xml entries. Add to this
# as new mismatches turn up in unresolved-signing.json rather than building
# a general fuzzy matcher, which risks false-positive matches across the
# league's many shared surnames.
NAME_ALIASES = {
    squash('Nic Claxton'): squash('Nicolas Claxton'),
    squash('Alex Sarr'): squash('Alexandre Sarr'),
    squash('Svi Mykhailiuk'): squash('Sviatoslav Mykhailiuk'),
    squash('Bones Hyland'): squash('Nahshon Bones Hyland'),
    squash('Robert Williams'): squash('Robert Williams III'),
    squash('Ron Holland'): squash('Ron Holland II'),
    squash('Bub Carrington'): squash('Carlton Carrington'),
    squash('Cam Christie'): squash('Cameron Christie'),
    squash('Walter Clayton'): squash('Walter Clayton Jr.'),
    squash('Yanic Konan Niederhäuser'): squash('Yanic Niederhauser'),
    squash('Egor Dёmin'): squash('Egor Demin'),
    squash('Tolu Smith'): squash('Tolu Smith III'),
}


def parse_sitemap_slugs(path):
    """sitemap.xml -> {squash(name-ish key): real /players/{slug}}, built
    from every /players/<slug> URL the sitemap lists (verified ~2,500 of
    them, current roster + historical players). This is the authoritative
    slug source: slugify() only guesses a plausible slug and is wrong for
    a meaningful share of real players (see squash()'s docstring), so
    build_signing_incentives() should look a player up here first and only
    fall back to slugify() if the sitemap has no entry (e.g. a slug not
    covered yet). On a squash collision (rare same-name duplicates, e.g.
    'justin-jackson' vs 'justin-jackson2') the shorter slug wins, since the
    unsuffixed form is consistently the more common/current player in spot
    checks — not a guarantee, just the best available tiebreak."""
    text = open(path, encoding='utf-8', errors='replace').read()
    mapping = {}
    for slug in re.findall(r'/players/([a-z0-9-]+)</loc>', text):
        key = squash(slug)
        if key not in mapping or len(slug) < len(mapping[key]):
            mapping[key] = slug
    if not mapping:
        raise RuntimeError('sitemap parsed to zero player slugs — page layout changed')
    return mapping


def _money(text):
    t = text.replace('$', '').replace(',', '').strip()
    return int(t) if t.lstrip('-').isdigit() else None


def _iso_date(text):
    try:
        return datetime.strptime(text.strip(), '%b %d, %Y').date().isoformat()
    except ValueError:
        return None


def _iso_date_long(text):
    """Like _iso_date but for the player-contract block's 'Signing Date',
    which renders the full month name (e.g. 'August 6, 2023') rather than
    the trade-exception tracker's abbreviated form."""
    try:
        return datetime.strptime(text.strip(), '%B %d, %Y').date().isoformat()
    except ValueError:
        return None


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch_page(url, path):
    """Single-URL fetch with retry, mirrors run.py's fetch_one. True/False."""
    for attempt in range(1, FETCH_TRIES + 1):
        try:
            data = _get(url)
            if len(data) < MIN_BYTES:
                raise RuntimeError(f'suspiciously small response ({len(data)} bytes)')
            open(path, 'wb').write(data)
            return True
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as e:
            reason = getattr(e, 'code', None) or getattr(e, 'reason', None) or e
            if attempt < FETCH_TRIES:
                wait = BACKOFF_BASE * (2 ** (attempt - 1)) + random.uniform(0, 1)
                time.sleep(wait)
            else:
                print(f'    FAILED  {url}  ({reason})')
    return False


def _soup(path):
    return BeautifulSoup(open(path, encoding='utf-8', errors='replace').read(), 'html.parser')


def parse_trade_exceptions(path):
    """/trade-exception -> [{team, fromPlayer, amount, expires (ISO), id}]
    `amount` is the REMAINING balance (not the original exception size) —
    that's the figure that matters for "can this TPE absorb X salary"."""
    table = _soup(path).find('table', class_=re.compile('sw_table__tradeExptn'))
    if table is None:
        raise RuntimeError('trade-exception table not found — page layout changed')
    out = []
    for tr in table.find('tbody').find_all('tr'):
        tds = tr.find_all('td')
        abbr_span = tr.find('span', class_='sw_table__collapsibleTeamColumn_abbreviation')
        if abbr_span is None or len(tds) < 7:
            continue
        team = to_app_abbr(abbr_span.get_text(strip=True))
        player = tds[1].get_text(strip=True)
        remaining = _money(tds[4].get_text(strip=True))
        start = _iso_date(tds[5].get_text(strip=True))
        end = _iso_date(tds[6].get_text(strip=True))
        if remaining is None or not end:
            continue
        out.append({
            'team': team, 'fromPlayer': player, 'amount': remaining, 'expires': end,
            'id': f'{team}-{slugify(player)}-{start or end}',
        })
    if not out:
        raise RuntimeError('trade-exception parsed to zero rows — page layout changed')
    return out


def parse_hard_cap(path):
    """/hard-cap-tracker -> [{team, apron: 1|2, trigger}] — one row per
    currently-hard-capped team; teams not hard-capped simply don't appear."""
    tables = _soup(path).find_all('table', class_=re.compile('sw_table__hardCapTracker'))
    if not tables:
        raise RuntimeError('hard-cap-tracker table(s) not found — page layout changed')
    out = []
    for table in tables:
        headers = [th.get_text(' ', strip=True) for th in table.find('thead').find_all('th')]
        for tr in table.find('tbody').find_all('tr'):
            tds = tr.find_all('td')
            abbr_span = tr.find('span', class_='sw_table__collapsibleTeamColumn_abbreviation')
            if abbr_span is None or len(tds) < 2:
                continue
            team = to_app_abbr(abbr_span.get_text(strip=True))
            capped_at = tds[1].get_text(strip=True)
            apron = 2 if '2nd' in capped_at else 1
            trigger = None
            for i, td in enumerate(tds[2:], start=2):
                if 'sw_table__emphasis' in (td.get('class') or []) and td.get_text(strip=True):
                    trigger = f'{headers[i]}: {td.get_text(" ", strip=True)}' if i < len(headers) else td.get_text(' ', strip=True)
                    break
            out.append({'team': team, 'apron': apron, 'trigger': trigger})
    if not out:
        raise RuntimeError('hard-cap-tracker parsed to zero rows — page layout changed')
    return out


# Ordered, most-specific-first keyword checks against SalarySwish's own
# "Signing Method" text. Deliberately conservative: a bare "Mid-Level
# Exception" (without Non-Taxpayer/Taxpayer/Room qualifying it) or anything
# unrecognized maps to None rather than guessing — a wrong exception type is
# worse than a missing one for hard-cap logic.
_SIGNING_METHOD_RULES = [
    (re.compile(r'minimum'), 'minimum'),
    (re.compile(r'rookie'), 'rookie-scale'),
    (re.compile(r'non-?\s*taxpayer.*mid-?\s*level'), 'non-taxpayer-mle'),
    (re.compile(r'taxpayer.*mid-?\s*level'), 'taxpayer-mle'),
    (re.compile(r'room.*mid-?\s*level'), 'room-mle'),
    (re.compile(r'bi-?\s*annual'), 'bi-annual'),
    (re.compile(r'non-?\s*bird'), 'non-bird'),
    (re.compile(r'early-?\s*bird'), 'early-bird'),
    (re.compile(r'\bbird\b'), 'bird'),
    (re.compile(r'cap\s*room'), 'cap-room'),
    (re.compile(r'max(imum)?\s*(salary)?\s*exception'), 'max'),
]


def classify_signing_method(text):
    if not text:
        return None
    low = text.lower()
    for pattern, value in _SIGNING_METHOD_RULES:
        if pattern.search(low):
            return value
    return None


def parse_player(path, team_abbr=None, min_season=None):
    """/players/{slug} -> {signedUnder, incentives: {season: {likely, unlikely}}}
    for the player's CURRENT contract. `min_season` (e.g. '2026-27'), when
    given, drops incentive rows for seasons before it — a player's
    incentive table includes past seasons too (their whole contract's
    history, not just what's left of it), and the app's Season type only
    covers the current season onward. Comparing season strings lexically is
    safe here since they're all 'YYYY-YY' with YYYY in the same range.

    Originally this picked the block whose "Signing Team" matched the
    player's current team per our own data. That's wrong for anyone who has
    been TRADED since they last signed: SalarySwish's "Signing Team" records
    who they signed with, not who currently holds the contract, so a traded
    player's active deal permanently shows their old team (verified live —
    e.g. Anthony Davis's most-recent-dated block still reads "Signing Team:
    LAL" from his 2023 extension, even though he was later traded to DAL;
    Giannis/Morant still show MIL/MEM because they haven't been traded since
    signing, which is why team-matching happened to work for them and masked
    the bug). `team_abbr` is kept as an accepted param for call-site
    stability but is no longer used to select the block.

    The reliable signal instead is recency: a player's page lists every past
    contract too, and the block with the latest "Signing Date" is always
    their current deal regardless of any trade since. Confirmed against
    several live pages that this holds even though the remaining (older)
    blocks are not necessarily in a consistent chronological order.
    Returns None if no block has a parseable Signing Date (stale page
    relative to our data, or a slug that resolved to the wrong player) —
    caller treats that as unresolved, not a hard failure."""
    soup = _soup(path)
    best = None  # (date, incentives, method_text)
    for block in soup.find_all('div', class_='sw_playerContract'):
        signing_date = None
        method_text = None
        for meta in block.find_all('div'):
            title = meta.find('span', class_='sw_playerContract__meta_title', recursive=False)
            if title is None:
                continue
            label = title.get_text(strip=True)
            if label == 'Signing Date':
                signing_date = _iso_date_long(meta.get_text(' ', strip=True).split(':', 1)[-1])
            elif label == 'Signing Method':
                method_text = meta.get_text(' ', strip=True).split(':', 1)[-1].strip()
        if signing_date is None:
            continue
        if best is None or signing_date > best[0]:
            best = (signing_date, block, method_text)
    if best is None:
        return None
    _, block, method_text = best
    incentives = {}
    table = block.find('table')
    if table is not None and table.find('thead') is not None:
        head_cells = [th.get_text(' ', strip=True) for th in table.find('thead').find_all('th')]
        likely_idx = next((i for i, h in enumerate(head_cells) if h.startswith('Likely')), None)
        unlikely_idx = next((i for i, h in enumerate(head_cells) if h.startswith('Unlikely')), None)
        for tr in table.find('tbody').find_all('tr'):
            tds = tr.find_all('td')
            if not tds:
                continue
            season = tds[0].get_text(' ', strip=True).split()[0]
            if not re.match(r'^\d{4}-\d{2}$', season):
                continue
            if min_season is not None and season < min_season:
                continue
            likely = _money(tds[likely_idx].get_text(strip=True)) if likely_idx is not None and likely_idx < len(tds) else None
            unlikely = _money(tds[unlikely_idx].get_text(strip=True)) if unlikely_idx is not None and unlikely_idx < len(tds) else None
            if likely is not None or unlikely is not None:
                incentives[season] = {'likely': likely or 0, 'unlikely': unlikely or 0}
    return {'signedUnder': classify_signing_method(method_text), 'incentives': incentives}


# ---------------------------------------------------------------------------
# /transactions/{team-slug} — full per-team transaction history. Added
# 2026-08-06 to replace bbref.py's parse_transactions() as the source of
# Player.acquisition: BBRef's season transactions page is bound to a season
# number (NBA_{year}_transactions.html) that doesn't exist until BBRef
# publishes it — historically weeks to months after a new season starts,
# which left every acquisition since ~2026-07-09 either missing or (worse)
# silently wrong (a stale prior-season record left in place — e.g. Deandre
# Ayton's Feb 2026 trade to Washington was invisible behind a July 2025
# free-agent signing record with a different team). This source has no such
# gap: confirmed live, a single team's page (Atlanta Hawks) reaches back to
# April 2026 activity and beyond with no season boundary, and the league-wide
# /transactions feed (a shallower, non-authoritative preview of the same
# data) already showed entries dated the same day this was checked.
#
# 30 team-scoped pages, not one URL, so — like captracker.py — this owns its
# own small fetch loop instead of going through run.py's single-URL
# fetch_one/fetch_all.
TEAM_SLUG_TO_ABBR = {
    'hawks': 'ATL', 'celtics': 'BOS', 'nets': 'BRK', 'hornets': 'CHO',
    'bulls': 'CHI', 'cavaliers': 'CLE', 'mavericks': 'DAL', 'nuggets': 'DEN',
    'pistons': 'DET', 'warriors': 'GSW', 'rockets': 'HOU', 'pacers': 'IND',
    'clippers': 'LAC', 'lakers': 'LAL', 'grizzlies': 'MEM', 'heat': 'MIA',
    'bucks': 'MIL', 'timberwolves': 'MIN', 'pelicans': 'NOP', 'knicks': 'NYK',
    'thunder': 'OKC', 'magic': 'ORL', 'sixers': 'PHI', 'suns': 'PHO',
    'trailblazers': 'POR', 'kings': 'SAC', 'spurs': 'SAS', 'raptors': 'TOR',
    'jazz': 'UTA', 'wizards': 'WAS',
}
TEAM_TRANSACTIONS_URL = 'https://www.salaryswish.com/transactions/{slug}'


def fetch_team_transactions(raw_dir, offline=False):
    """Fetches all 30 team transaction pages into raw_dir. Returns the set
    of slugs that failed (never raises for a single team) — mirrors
    captracker.py's fetch_all so a failed team just falls back to that
    team's last-good snapshot rather than aborting the whole source."""
    os.makedirs(raw_dir, exist_ok=True)
    failed = set()
    for slug in TEAM_SLUG_TO_ABBR:
        path = os.path.join(raw_dir, f'{slug}.html')
        if offline:
            if not os.path.exists(path):
                failed.add(slug)
            continue
        if not fetch_page(TEAM_TRANSACTIONS_URL.format(slug=slug), path):
            failed.add(slug)
        time.sleep(1.0)
    return failed


# Ordered against a full 30-team live sample (2026-08-06) of every distinct
# TRANSACTION column value in use — not guessed from a handful of examples.
# Anything not matched here is deliberately NOT an acquisition: roster-status
# churn (Inactive List, G-League recalls/reassignments), option/guarantee
# decisions, holds, and departures (waived, cleared waivers, contract
# terminated/bought out) don't put a player on a new team, and including them
# would let a later, unrelated status change silently overwrite a real
# acquisition in run.py's "latest by date wins" merge.
def _classify_team_transaction(text):
    if text.startswith('Traded from'):
        return 'trade'
    if text.startswith('Claimed on waivers by'):
        return 'waiver'
    if text == 'Drafted':
        return 'draft'
    if text.startswith('Signed to') and 'Extension' in text:
        return 'extension'
    if text.startswith('Signed to'):
        # Veteran / Rookie / Rookie Scale / Two-Way / Exhibit 10 / 10-Day
        # Contract — all a fresh signing, none of them a pool-limited
        # exception distinction (that's signedUnder's job, not this field's).
        return 'free-agent'
    return None


def parse_team_transactions(path, team_abbr):
    """/transactions/{team-slug} -> [{name, date, dateRaw, method, toTeams,
    fromTeams, text, flags}], same record shape as bbref.parse_transactions()
    / realgm.parse_transactions() so all three can merge into one list.

    Table shape (verified against a 30-team live sample): a header row, then
    repeating (date row, N data rows, separator row) groups. The date row is
    `<tr class="sw_table__secondaryHeader">` with one <td colspan="4">; data
    rows have exactly 4 <td>s (team, player, transaction text, a literal '✔'
    or empty for "rights acquired"). No bbrefId/realgmId — matching in
    run.py's build_enrichment falls through to name normalization via
    _base(), same as any cross-source record with no id match.

    Uses get_text(' ', strip=True) on the transaction cell, not bare
    get_text(strip=True) — the "Traded from OKC" text is split across an
    <a>Traded</a> plus a trailing text node, and BeautifulSoup's per-node
    stripping otherwise silently swallows the space between them (confirmed:
    produces "Tradedfrom OKC"). This is the exact bug bbref.py's own
    parse_transactions already had to work around once.
    """
    soup = _soup(path)
    table = soup.find('table')
    if table is None:
        raise RuntimeError(f'team transactions table not found for {team_abbr} — page layout changed')
    out = []
    current_date = None
    current_date_raw = None
    for tr in table.find_all('tr'):
        if 'sw_table__secondaryHeader' in (tr.get('class') or []):
            td = tr.find('td')
            current_date_raw = td.get_text(strip=True) if td else None
            current_date = _iso_date(current_date_raw) if current_date_raw else None
            continue
        tds = tr.find_all('td')
        if len(tds) != 4 or current_date is None:
            continue
        player_link = tds[1].find('a')
        if player_link is None:
            continue
        name = player_link.get_text(strip=True)
        txn_text = tds[2].get_text(' ', strip=True)
        method = _classify_team_transaction(txn_text)
        if method is None:
            continue
        from_teams = []
        if method == 'trade':
            m = re.search(r'from (\w+)$', txn_text)
            if m:
                from_teams = [m.group(1)]
        elif method == 'waiver' and txn_text.startswith('Claimed on waivers by'):
            # This team's own page only shows waiver claims IT made — the
            # claiming team is already team_abbr, not worth re-parsing here.
            pass
        out.append({
            'bbrefId': None,
            'name': name,
            'date': current_date,
            'dateRaw': current_date_raw,
            'method': method,
            'toTeams': [team_abbr],
            'fromTeams': from_teams,
            'text': txn_text,
            'flags': [],
        })
    if not out:
        raise RuntimeError(f'team transactions parsed to zero rows for {team_abbr} — page layout changed')
    return out


def parse_all_team_transactions(raw_dir, slugs=None):
    """Aggregates parse_team_transactions() across every team whose raw HTML
    exists in raw_dir. A team missing its file (fetch failed this run) is
    silently skipped — caller falls back to that team's contribution from
    the prior run's merged transactions.json, matching every other
    partial-failure path in this pipeline."""
    slugs = slugs or list(TEAM_SLUG_TO_ABBR)
    out = []
    for slug in slugs:
        path = os.path.join(raw_dir, f'{slug}.html')
        if not os.path.exists(path):
            continue
        out.extend(parse_team_transactions(path, TEAM_SLUG_TO_ABBR[slug]))
    return out


# ---------------------------------------------------------------------------
# Exception-usage trackers, added 2026-08-06 to answer "which exception
# financed this signing/trade, and how much does each team have left" —
# these are the fields nothing in the pipeline had a source for before:
# NTMLE/TMLE/room-MLE/BAE usage and remaining balance, and which TPE
# financed a given trade acquisition. All four are single-page, league-wide
# (not per-team), so they go through run.py's normal fetch_one/SOURCES path
# like /trade-exception and /hard-cap-tracker already do — no new fetch loop
# needed.
#
# Full team-name -> app abbreviation. A separate table from TEAM_TO_ABBR
# above (which only overrides 3-letter codes): these tracker pages render
# the team as its full display name, not a code, and none of the existing
# per-source name maps elsewhere in this pipeline (realgm.py, draft-picks.ts)
# are imported cross-module, so this one is self-contained like the others.
TEAM_NAME_TO_ABBR = {
    'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BRK',
    'Charlotte Hornets': 'CHO', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
    'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
    'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
    'LA Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
    'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
    'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
    'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHO',
    'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS',
    'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
}

MLE_URL = 'https://salaryswish.com/mid-level-exception'
BAE_URL = 'https://salaryswish.com/bi-annual-exception'
DPE_URL = 'https://salaryswish.com/disabled-player-exception'

# The 'Signings' column's <b>TIER</b> label -> our signedUnder vocabulary.
# Confirmed live: 'MLE' (non-taxpayer), 'TP-MLE' (taxpayer), 'R-MLE' (room).
_MLE_TIER_LABEL = {'MLE': 'non-taxpayer-mle', 'TP-MLE': 'taxpayer-mle', 'R-MLE': 'room-mle'}

_SIGNING_ENTRY_RE = re.compile(r'^(.+?)\s*\(\$?([\d,]+)\)$')
_BAE_ENTRY_RE = re.compile(r'^(.+?)\s*\(\$?([\d,]+)\s*-\s*([A-Za-z]{3} \d{1,2}, \d{4})\)$')


def parse_trade_exception_usage(path):
    """/trade-exception's 'Used' column -> [{team, tpeFromPlayer,
    usedByPlayer, amount, date}]. A nonzero Used value carries a tooltip
    (`<span class="q" title="PLAYER (Mon DD, YYYY)">`, confirmed live) naming
    which player the TPE was applied to acquire, and when — the direct
    answer to "which exception financed this trade." `team`/`tpeFromPlayer`
    identify which TPE (same row as parse_trade_exceptions); a zero-used row
    has no tooltip and is skipped, not an error — most TPEs go unused."""
    table = _soup(path).find('table', class_=re.compile('sw_table__tradeExptn'))
    if table is None:
        raise RuntimeError('trade-exception table not found — page layout changed')
    out = []
    for tr in table.find('tbody').find_all('tr'):
        tds = tr.find_all('td')
        abbr_span = tr.find('span', class_='sw_table__collapsibleTeamColumn_abbreviation')
        if abbr_span is None or len(tds) < 4:
            continue
        used_span = tds[3].find('span', class_='q')
        if used_span is None or not used_span.get('title'):
            continue
        m = re.match(r'^(.+?)\s*\(([A-Za-z]{3} \d{1,2}, \d{4})\)$', used_span['title'])
        if not m:
            continue
        amount = _money(used_span.get_text(strip=True))
        date = _iso_date(m.group(2))
        if amount is None or not date:
            continue
        out.append({
            'team': to_app_abbr(abbr_span.get_text(strip=True)),
            'tpeFromPlayer': tds[1].get_text(strip=True),
            'usedByPlayer': m.group(1),
            'amount': amount,
            'date': date,
        })
    return out


def parse_mle_tracker(path):
    """/mid-level-exception -> [{team, signings: [{exception, player,
    amount}], roomRemaining, nonTaxpayerRemaining, taxpayerRemaining}], one
    row per team league-wide (not one row per signing — a team can have
    zero, one, or several signings, but always has three remaining-space
    figures worth recording either way). The remaining-space figures are
    read directly off the page's own 'Room Space' / 'Non-Taxpayer Space' /
    'Taxpayer Space' columns rather than derived from LEAGUE_CAP's pool
    amounts — SalarySwish already accounts for real subtleties we shouldn't
    re-derive ourselves (the page's own note: it auto-zeroes an exception
    that isn't actually usable yet, e.g. NTMLE space shows $0 if the team's
    cap room already exceeds the NTMLE amount). A '-' cell (not applicable —
    e.g. forfeited by using a different exception this season) parses to
    None via _money(), not 0; treat None and 0 differently downstream.

    The 'Signings' cell groups multiple players under one <b>TIER</b> label
    when a team splits its MLE across several signings (confirmed live on
    Philadelphia's row: two players, only the first tagged <b>MLE</b> — both
    share it, since the NTMLE is explicitly splittable per the CBA). Track
    the running label per cell rather than assuming every entry is
    separately labeled."""
    soup = _soup(path)
    table = soup.find('table')
    if table is None:
        raise RuntimeError('mid-level-exception table not found — page layout changed')
    out = []
    for tr in table.find('tbody').find_all('tr'):
        team_link = tr.find('td').find('a')
        if team_link is None:
            continue
        team_name = team_link.find('span', class_='sw_table__collapsibleTeamColumn_name')
        team = TEAM_NAME_TO_ABBR.get(team_name.get_text(strip=True)) if team_name else None
        if team is None:
            continue
        tds = tr.find_all('td')
        if len(tds) < 10:
            continue
        signings = []
        current_tier = None
        for div in tds[6].find_all('div'):
            b = div.find('b')
            if b is not None:
                current_tier = _MLE_TIER_LABEL.get(b.get_text(strip=True))
            if current_tier is None:
                continue
            a = div.find('a')
            if a is None:
                continue
            text = div.get_text(' ', strip=True)
            # b's own text (e.g. "MLE") is part of get_text() too — strip it.
            if b is not None:
                text = text[len(b.get_text(strip=True)):].strip()
            m = _SIGNING_ENTRY_RE.match(text)
            if not m:
                continue
            signings.append({
                'exception': current_tier,
                'player': a.get_text(strip=True),
                'amount': int(m.group(2).replace(',', '')),
            })
        out.append({
            'team': team,
            'signings': signings,
            'roomRemaining': _money(tds[7].get_text(strip=True)),
            'nonTaxpayerRemaining': _money(tds[8].get_text(strip=True)),
            'taxpayerRemaining': _money(tds[9].get_text(strip=True)),
        })
    return out


def parse_bae_tracker(path):
    """/bi-annual-exception -> [{team, signings: [{player, amount, date}],
    remaining}], one row per team league-wide (not one row per signing — a
    team with zero signings and a full remaining balance is real, useful
    information, not a no-op row to skip).

    `remaining` is read from the rendered 'Space' <td> text via _money(),
    NOT the <tr>'s `data-sort-remaining` attribute — confirmed live that the
    attribute defaults to "0" even when the real state is "not applicable"
    (e.g. Brooklyn's row: remaining shows literal '-' — BAE forfeited this
    season because the team already used cap room — but
    data-sort-remaining="0" all the same). _money() correctly returns None
    for '-'; treat None (not applicable / forfeited) and 0 (available but
    exhausted) as different states downstream. This is the same class of
    trap as the already-documented data-sort-end_date bug on the
    trade-exception tracker — trust rendered text over data-sort-* here too."""
    soup = _soup(path)
    table = soup.find('table')
    if table is None:
        raise RuntimeError('bi-annual-exception table not found — page layout changed')
    out = []
    for tr in table.find('tbody').find_all('tr'):
        team_link = tr.find('td').find('a')
        if team_link is None:
            continue
        team_name = team_link.find('span', class_='sw_table__collapsibleTeamColumn_name')
        team = TEAM_NAME_TO_ABBR.get(team_name.get_text(strip=True)) if team_name else None
        if team is None:
            continue
        tds = tr.find_all('td')
        if len(tds) < 7:
            continue
        signings = []
        for div in tds[2].find_all('div'):
            a = div.find('a')
            if a is None:
                continue
            m = _BAE_ENTRY_RE.match(div.get_text(' ', strip=True))
            if not m:
                continue
            signings.append({
                'player': a.get_text(strip=True),
                'amount': int(m.group(2).replace(',', '')),
                'date': _iso_date(m.group(3)),
            })
        out.append({
            'team': team,
            'signings': signings,
            'remaining': _money(tds[6].get_text(strip=True)),
        })
    return out


def parse_dpe_tracker(path):
    """/disabled-player-exception -> [{team, player, initial, used, room}].
    One row per team that currently has an active DPE grant; teams without
    one simply don't appear (their row's PLAYER cell is '-', not parsed).
    `used` is a bool — the page's own 'DPE USED' column ('Yes'/'No'), not
    yet whether it's been spent, just whether the grant itself is live."""
    soup = _soup(path)
    table = soup.find('table')
    if table is None:
        raise RuntimeError('disabled-player-exception table not found — page layout changed')
    out = []
    for tr in table.find('tbody').find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) < 5:
            continue
        team = TEAM_NAME_TO_ABBR.get(tds[0].get_text(strip=True))
        player_link = tds[1].find('a')
        if team is None or player_link is None:
            continue
        initial = _money(tds[2].get_text(strip=True))
        used_text = tds[3].get_text(strip=True)
        room = _money(tds[4].get_text(strip=True))
        if initial is None:
            continue
        out.append({
            'team': team,
            'player': player_link.get_text(strip=True),
            'initial': initial,
            'used': used_text.lower() == 'yes',
            'room': room if room is not None else 0,
        })
    return out
