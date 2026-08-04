"""SalarySwish.com: held trade exceptions, hard-cap status, and per-player
signing-exception type + likely/unlikely incentive amounts.

Added per the July 2026 sourcing review of the six "no identified source"
CBA fields. SalarySwish (the independent CapFriendly-team successor, launched
Sept 2023) is the only public, non-Spotrac source found for these three.
Cash-in-trade ledgers and the "apron addon" gap are NOT covered by this
module — see data-inventory.md for why those stay open.

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
    return None
