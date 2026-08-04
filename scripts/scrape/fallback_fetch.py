"""Manual, on-demand fallback fetcher for when a source's lightweight
header trick (see run.py's X-Requested-With handling for RealGM) stops
being enough to get past Cloudflare's bot-management.

This is NOT part of the daily pipeline. It is not imported by run.py and
not called from fetch_all(). Reach for it only when a source has been
failing FETCH_TRIES retries consistently across multiple scheduled runs
AND the header fix no longer works — see docs/fallback-scraping.md for
the full runbook.

Setup (one-time, not part of the daily workflow's dependencies):
    pip install -r scripts/scrape/requirements-fallback.txt
    playwright install chromium

Usage:
    python scripts/scrape/fallback_fetch.py <source_name>

<source_name> must be a key in run.py's SOURCES dict, e.g.:
    python scripts/scrape/fallback_fetch.py realgm_future_drafts

On success this writes snapshots/raw/{source_name}.html — the exact same
path fetch_one() would have written — so bbref.py/realgm.py/etc. parse it
unmodified regardless of which fetch method produced the file. After
running this, re-run the normal offline pipeline step to parse and merge
the freshly fetched snapshot:
    python scripts/scrape/run.py --offline
"""
import os
import sys

from playwright.sync_api import sync_playwright

from run import RAW, SOURCES, MIN_BYTES

# Distinct from run.py's UA on purpose: this path exists specifically for
# sources that need to see full in-browser behavior (JS execution, a
# Cloudflare challenge resolving asynchronously after load), not just a
# spoofed identifying header, so it presents as an ordinary Chrome browser
# rather than identifying itself as this project's pipeline.
BROWSER_UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
              'AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/124.0.0.0 Safari/537.36')
VIEWPORT = {'width': 1440, 'height': 900}
NAV_TIMEOUT_MS = 45_000


def fetch_with_browser(name: str, url: str) -> bool:
    """Fetch `url` with a real headless Chromium browser and write the
    resulting HTML to snapshots/raw/{name}.html. Returns True on success,
    False if the page never produced enough content to look real."""
    path = os.path.join(RAW, f'{name}.html')
    os.makedirs(RAW, exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport=VIEWPORT, user_agent=BROWSER_UA)
            page = context.new_page()
            page.goto(url, timeout=NAV_TIMEOUT_MS, wait_until='domcontentloaded')
            # Cloudflare's JS challenge resolves asynchronously after the
            # initial page load, so wait for the actual content table rather
            # than trusting page-load events. networkidle is unusable here —
            # pages like this carry persistent background requests (ads,
            # analytics) that never go fully idle — so the table selector is
            # the reliable signal that the challenge has cleared.
            page.wait_for_selector('table', timeout=NAV_TIMEOUT_MS)
            html = page.content()
            browser.close()
    except Exception as e:
        print(f'  FAILED   {name}  (browser fetch error: {e})')
        return False

    data = html.encode('utf-8')
    if len(data) < MIN_BYTES:
        print(f'  FAILED   {name}  (suspiciously small response, {len(data)} bytes)')
        return False

    open(path, 'wb').write(data)
    print(f'  fetched  {name}  ({len(data):,} bytes)  [browser fallback]')
    return True


def main():
    if len(sys.argv) != 2:
        print(f'usage: python {os.path.basename(__file__)} <source_name>')
        sys.exit(1)
    name = sys.argv[1]
    url = SOURCES.get(name)
    if url is None:
        print(f'ERROR: "{name}" is not a key in run.py\'s SOURCES dict')
        sys.exit(1)
    ok = fetch_with_browser(name, url)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
