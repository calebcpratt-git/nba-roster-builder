"""Join bridge between SalarySwish roster-page names and this app's
canonical player names, built for the BBRef-contracts-page migration
(SalarySwish /teams/{slug} rosters becoming the source of Player.name,
Player.team, Player.salary, Player.options).

CANONICAL NAME CHOICE: the app's existing canonical form — whichever name
lib/player-data.ts, lib/rookie-years.ts, and contract-details.json /
awards.json already use — stays canonical. A SalarySwish roster name is
always resolved TO that form, never the other way around, so joins that
already key on the app's canonical name (PlayerRookieYear.name, awards,
contract details) don't all need repointing the moment Phase 1/2 land.

SalarySwish differs from the app's canonical names in two ways this module
bridges:
  1. Format — SalarySwish roster tables render "Last, First" (suffixes
     stay on the surname token: "Jackson Jr., Jaren"); flipping that to
     "First Last" is the caller's job (mirrors the roster-row parser), not
     this module's — by the time a name reaches here it's already "First
     Last" and the only remaining gap is which First-Last string.
  2. Legal vs. common name — SalarySwish indexes a handful of players under
     a full legal name or an extra surname the app's data doesn't carry
     (e.g. "Alexandre Sarr" vs. this app's "Alex Sarr"). squash() alone
     can't bridge that: it's not a formatting difference.

Matching tiers, in order:
  1. squash() match — SalarySwish name and an app canonical name normalize
     to the same bare alphanumeric string. Handles the routine formatting
     noise (hyphens/spacing/accents).
  2. _base() match — same idea, but ALSO strips a trailing Jr./Sr./II/III/IV
     suffix token before comparing. Needed as its own tier, separate from
     squash(): confirmed live against real active-roster players (Morez
     Johnson, Jaron Pierre, Labaron Philon, Darius Acuff, all currently
     rostered under real contracts) that SalarySwish's own "Last, First"
     column sometimes simply omits a suffix the app's canonical name
     carries — squash("Morez Johnson") != squash("Morez Johnson Jr."),
     since squash keeps the literal "jr" characters, so this needs the
     suffix stripped as a word first, not just extra normalization on top
     of squash.
  3. NAME_ALIASES — hand-maintained legal-name/common-name (or, for
     "Hansen Yang" vs. this app's "Yang Hansen", surname-order) pairs.
  4. SalarySwish's own /players/{slug} sitemap
     (salaryswish.parse_sitemap_slugs, fetched daily as
     salaryswish_sitemap): if squash(SalarySwish name) and squash(an app
     canonical name) each resolve to the SAME sitemap slug, SalarySwish
     itself is treating them as the same player under two renderings.
  5. Unmatched — written to snapshots/scraped/name-bridge-unmatched.json
     so these don't just silently vanish from a joined dataset; a
     recurring entry there is a candidate for a new NAME_ALIASES line.

Reuses salaryswish.squash() (bare-alphanumeric normalizer). _base() (the
suffix-stripping normalizer already used everywhere else in the pipeline
to join across sources) is defined HERE rather than in run.py specifically
so this module can use it without a circular import — run.py re-exports it
(`from name_bridge import _base`) for its other ~20 call sites.
"""
import json
import os
import re
import unicodedata

from salaryswish import squash, NAME_ALIASES as _SALARYSWISH_NAME_ALIASES


def _base(name):
    n = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    n = n.lower().replace('.', '').replace("'", '').replace('-', ' ')
    return re.sub(r'\s+', ' ', re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', n)).strip()

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'snapshots', 'scraped')
UNMATCHED_PATH = os.path.join(OUT_DIR, 'name-bridge-unmatched.json')

# Legal-vs-common-name pairs confirmed live against SalarySwish's roster
# tables and/or player-page sitemap. Starts from salaryswish.NAME_ALIASES
# (built to bridge the same problem against that module's /players/{slug}
# sitemap) rather than duplicating a second copy of the same handful of
# players; David Jones is new to this join specifically — SalarySwish's
# roster tables list him as "David Jones Garcia", which the sitemap-scoped
# dict above didn't need. Add new entries here (not a fuzzy matcher) as
# they turn up in name-bridge-unmatched.json, same policy as
# salaryswish.NAME_ALIASES.
NAME_ALIASES = dict(_SALARYSWISH_NAME_ALIASES)
NAME_ALIASES[squash('David Jones')] = squash('David Jones Garcia')
# Surname-first vs. given-name-first — not a legal-vs-common-name difference
# like the rest of this dict, but the same "one squash key needs to resolve
# to another" mechanism handles it. Confirmed live: SalarySwish's roster
# table renders this Chinese player as "Hansen, Yang" (treating "Hansen" as
# the surname column), which _flip_name() turns into "Hansen Yang" — backwards
# from this app's existing canonical "Yang Hansen" (family name first).
NAME_ALIASES[squash('Yang Hansen')] = squash('Hansen Yang')


def build_canonical_index(names):
    """names: an iterable of the app's canonical player names (from
    lib/player-data.ts, lib/rookie-years.ts, awards.json, etc).
    -> {squash(name): name, _base(name): name, ...} — both normalizations
    merged into one dict (their key spaces never collide: squash() has no
    spaces, _base() always does), so match_name's first two tiers are just
    two lookups against the same index. On a same-normalizer collision the
    last name wins — same tiebreak risk as salaryswish.parse_sitemap_slugs,
    acceptable here since real collisions are rare and checked live rather
    than guessed."""
    index = {}
    for n in names:
        index[squash(n)] = n
        index[_base(n)] = n
    return index


def match_name(ss_name, canonical_index, slug_by_squash=None):
    """Resolve a SalarySwish roster name (already flipped to 'First Last')
    to the app's canonical form.

    canonical_index: build_canonical_index() output.
    slug_by_squash: salaryswish.parse_sitemap_slugs() output, or None to
        skip tier 4 (e.g. when the sitemap snapshot isn't available).

    -> (canonical_name, tier) where tier is one of 'squash', 'base',
    'alias', 'sitemap'; (None, None) if nothing matched at any tier.
    """
    key = squash(ss_name)

    if key in canonical_index:
        return canonical_index[key], 'squash'

    base_key = _base(ss_name)
    if base_key in canonical_index:
        return canonical_index[base_key], 'base'

    for app_key, ss_key in NAME_ALIASES.items():
        if key == ss_key and app_key in canonical_index:
            return canonical_index[app_key], 'alias'
        if key == app_key and ss_key in canonical_index:
            return canonical_index[ss_key], 'alias'

    if slug_by_squash:
        ss_slug = slug_by_squash.get(key)
        if ss_slug:
            for app_key, app_name in canonical_index.items():
                if slug_by_squash.get(app_key) == ss_slug:
                    return app_name, 'sitemap'

    return None, None


def bridge_names(ss_names, canonical_index, slug_by_squash=None):
    """Match a batch of SalarySwish roster names against canonical_index.
    -> (matches: {ss_name: canonical_name}, unmatched: [ss_name, ...])."""
    matches = {}
    unmatched = []
    for name in ss_names:
        canonical, _tier = match_name(name, canonical_index, slug_by_squash)
        if canonical:
            matches[name] = canonical
        else:
            unmatched.append(name)
    return matches, unmatched


def write_unmatched_report(unmatched, path=UNMATCHED_PATH):
    """Writes snapshots/scraped/name-bridge-unmatched.json: every
    SalarySwish roster name that fell through all three match tiers, so
    the /data dashboard and manual review see them instead of these
    players silently dropping out of a joined dataset. {'name': ...}
    objects, not bare strings — matches every other unresolved-*.json
    file's shape so run.py's generic count_unresolved()/
    new_unresolved_records() machinery (which reads record['name']) works
    on this file too."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump([{'name': n} for n in sorted(set(unmatched))], f, indent=2)
        f.write('\n')
