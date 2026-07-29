"""nbacaptracker.com: dead money, cap holds, cap/tax/apron figures per team.

Different fetch shape than the other sources (30 team pages, not one URL), so
this module owns its own small fetch loop rather than going through run.py's
single-URL fetch_one/fetch_all. Parsing is also different in kind: the site is
a Next.js app that embeds its data as JSON inside <script> hydration payloads,
not in visible HTML tables — there is nothing for BeautifulSoup to select here,
this is JSON extraction, not markup parsing.

IMPORTANT: the JSON payload is split across MULTIPLE
<script>self.__next_f.push([1,"..."])</script> tags. Concatenate every chunk
into one string BEFORE unicode-unescaping and regex-extracting — parsing
chunks independently silently truncates ~1 in 5 records.
"""
import json
import os
import re
import time
import random
import urllib.request
import urllib.error

TEAM_SLUGS = [
    'atlanta-hawks', 'boston-celtics', 'brooklyn-nets', 'charlotte-hornets',
    'chicago-bulls', 'cleveland-cavaliers', 'dallas-mavericks', 'denver-nuggets',
    'detroit-pistons', 'golden-state-warriors', 'houston-rockets', 'indiana-pacers',
    'los-angeles-clippers', 'los-angeles-lakers', 'memphis-grizzlies', 'miami-heat',
    'milwaukee-bucks', 'minnesota-timberwolves', 'new-orleans-pelicans',
    'new-york-knicks', 'oklahoma-city-thunder', 'orlando-magic',
    'philadelphia-76ers', 'phoenix-suns', 'portland-trail-blazers',
    'sacramento-kings', 'san-antonio-spurs', 'toronto-raptors', 'utah-jazz',
    'washington-wizards',
]

# Maps nbacaptracker's team page slug -> this app's TEAM_ABBREVIATIONS code.
SLUG_TO_ABBR = {
    'atlanta-hawks': 'ATL', 'boston-celtics': 'BOS', 'brooklyn-nets': 'BRK',
    'charlotte-hornets': 'CHO', 'chicago-bulls': 'CHI', 'cleveland-cavaliers': 'CLE',
    'dallas-mavericks': 'DAL', 'denver-nuggets': 'DEN', 'detroit-pistons': 'DET',
    'golden-state-warriors': 'GSW', 'houston-rockets': 'HOU', 'indiana-pacers': 'IND',
    'los-angeles-clippers': 'LAC', 'los-angeles-lakers': 'LAL', 'memphis-grizzlies': 'MEM',
    'miami-heat': 'MIA', 'milwaukee-bucks': 'MIL', 'minnesota-timberwolves': 'MIN',
    'new-orleans-pelicans': 'NOP', 'new-york-knicks': 'NYK', 'oklahoma-city-thunder': 'OKC',
    'orlando-magic': 'ORL', 'philadelphia-76ers': 'PHI', 'phoenix-suns': 'PHO',
    'portland-trail-blazers': 'POR', 'sacramento-kings': 'SAC', 'san-antonio-spurs': 'SAS',
    'toronto-raptors': 'TOR', 'utah-jazz': 'UTA', 'washington-wizards': 'WAS',
}

UA = 'nba-roster-builder-pipeline/1.0 (personal project; +https://github.com/calebcpratt-git/nba-roster-builder)'
MIN_BYTES = 20_000
FETCH_TRIES = 4
BACKOFF_BASE = 3

CHUNK_RE = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')
# Season-state objects are flat (no nested braces), so a bounded [^{}]* is a
# safe, simple match. deadMoneyPlayers/capHoldRows are arrays of objects, so a
# "stop at the next ]" regex is NOT safe — the array isn't always the last key
# in its enclosing object, and depth-1 regex matching then runs past the
# array's real end looking for a "]}" that happens to appear later in the
# blob, producing a multi-KB string that fails json.loads with "Extra data".
# _extract_json_array below does real bracket-depth counting instead.
#
# The key requires "inclusive_total" right after "year", not just "year"
# alone: individual salary line-items and cap-hold rows elsewhere in the blob
# also happen to start with {"year":"YYYY/YY",... (e.g.
# {"year":"2026/27","amount":9658536,"type":null}), and a bare year match
# picks up dozens of those per team alongside the one real per-season summary
# object. Verified against a live team page: a bare {"year":"..."[^{}]*}
# regex returned 105 matches (only ~9 genuine); requiring "inclusive_total"
# cuts that down to just the real summary objects (still 2x-duplicated by the
# site's own markup, which season_state dedupes below).
SEASON_OBJ_RE = re.compile(r'\{"year":"\d{4}/\d{2}","inclusive_total":[^{}]*\}')


def _extract_json_array(blob, key):
    """Find "<key>": in blob and return the full balanced JSON array that
    follows it, tracking string/escape state so brackets inside string values
    don't throw off the depth count. Returns None if the key is missing or
    the array is truncated (unbalanced) — e.g. a chunk boundary cut it off."""
    marker = f'"{key}":'
    idx = blob.find(marker)
    if idx == -1:
        return None
    start = blob.find('[', idx)
    if start == -1:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(blob)):
        c = blob[i]
        if in_string:
            if escape:
                escape = False
            elif c == '\\':
                escape = True
            elif c == '"':
                in_string = False
        else:
            if c == '"':
                in_string = True
            elif c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    return blob[start:i + 1]
    return None


def fetch_one(slug, raw_dir):
    """Mirrors run.py's fetch_one retry/backoff shape, scoped to one team page."""
    path = os.path.join(raw_dir, f'nbacaptracker_{slug}.html')
    url = f'https://www.nbacaptracker.com/teams/{slug}'
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
                wait = BACKOFF_BASE * (2 ** (attempt - 1)) + random.uniform(0, 2)
                print(f'    retry  {slug}  ({reason}) — attempt {attempt}/{FETCH_TRIES}, waiting {wait:.0f}s')
                time.sleep(wait)
            else:
                print(f'    FAILED {slug}  ({reason}) — gave up after {FETCH_TRIES} attempts')
    return False


def fetch_all(raw_dir, offline=False):
    """Fetch every team page. Never raises for a single team; returns the set
    of slugs that could not be obtained this run."""
    os.makedirs(raw_dir, exist_ok=True)
    failed = set()
    for i, slug in enumerate(TEAM_SLUGS):
        path = os.path.join(raw_dir, f'nbacaptracker_{slug}.html')
        if offline:
            if os.path.exists(path):
                print(f'    offline  {slug}')
            else:
                print(f'    MISSING  {slug}  (no snapshot; --offline)')
                failed.add(slug)
            continue
        if fetch_one(slug, raw_dir):
            print(f'    fetched  {slug}')
        else:
            failed.add(slug)
        if i < len(TEAM_SLUGS) - 1:
            time.sleep(2)  # be a polite guest between team pages
    return failed


def _fix_mojibake(s):
    """nbacaptracker's payload sometimes double-encodes accented names (e.g.
    Mičić -> literal chars U+00C4 U+0087 after unicode_escape). Re-interpret
    as latin-1 bytes and redecode as UTF-8; falls back to the original string
    if that doesn't produce valid UTF-8."""
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _extract_blob(html_text):
    chunks = CHUNK_RE.findall(html_text)
    blob = ''.join(chunks)
    blob = blob.encode().decode('unicode_escape', errors='ignore')
    blob = blob.replace('\\"', '"')
    return _fix_mojibake(blob)


def parse_team(html_text, slug):
    blob = _extract_blob(html_text)
    abbr = SLUG_TO_ABBR[slug]
    # The site embeds each season's summary object twice (e.g. once for an
    # overview panel, once for a chart) — dedupe by year, keeping the first
    # occurrence, rather than emit two identical TeamCapSeason entries for
    # the same team+season key downstream.
    season_by_year = {}
    for raw in SEASON_OBJ_RE.findall(blob):
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue  # truncated at a chunk boundary; skip rather than crash the run
        season_by_year.setdefault(obj['year'], obj)
    season_state = list(season_by_year.values())
    dead_money = []
    dm_raw = _extract_json_array(blob, 'deadMoneyPlayers')
    if dm_raw:
        try:
            dead_money = json.loads(dm_raw)
        except json.JSONDecodeError:
            pass
    cap_holds = []
    ch_raw = _extract_json_array(blob, 'capHoldRows')
    if ch_raw:
        try:
            cap_holds = json.loads(ch_raw)
        except json.JSONDecodeError:
            pass
    return {'team': abbr, 'seasonCapState': season_state,
            'deadMoneyPlayers': dead_money, 'capHoldRows': cap_holds}


def parse_all(raw_dir, slugs=None):
    """-> [{team, seasonCapState, deadMoneyPlayers, capHoldRows}, ...] for
    whichever team snapshots exist in raw_dir. Missing snapshots are skipped,
    not fatal — a partial nbacaptracker run should still update what it got."""
    slugs = slugs or TEAM_SLUGS
    out = []
    for slug in slugs:
        path = os.path.join(raw_dir, f'nbacaptracker_{slug}.html')
        if not os.path.exists(path):
            continue
        try:
            out.append(parse_team(open(path, encoding='utf-8', errors='replace').read(), slug))
        except Exception as e:
            print(f'    SKIP parse {slug}: {e}')
    if not out:
        raise RuntimeError('nbacaptracker parsed zero teams — check raw snapshots exist')
    return out
