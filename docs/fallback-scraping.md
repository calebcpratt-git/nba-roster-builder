# Fallback scraping: headless-browser fetch

`scripts/scrape/fallback_fetch.py` is a manual, on-demand fetch path held
in reserve for when a source's lightweight fetch (the `X-Requested-With`
header trick `fetch_one()` uses for RealGM, in `scripts/scrape/run.py`)
stops being enough to get past Cloudflare's bot-management. It drives a
real headless Chromium browser via `playwright` instead of a raw
`urllib` request.

**This is not scheduled anywhere and is not meant to become the default
fetch method.** It's slower and heavier than the header trick, and
reaching for it by default would be solving a problem that doesn't exist
yet. `run.py`'s `fetch_one()`/`fetch_all()` are unmodified by this and
keep using the existing urllib + header approach.

## When to use this

- A source has failed `FETCH_TRIES` retries in `run.py` consistently
  across multiple scheduled runs (this is what the consecutive-failure
  alerting is meant to surface), **and**
- the `X-Requested-With`-style header fix no longer works for it.

## How to use it

One-time setup (not part of the daily GitHub Actions workflow's
dependencies — this stays isolated in its own requirements file):

```bash
pip install -r scripts/scrape/requirements-fallback.txt
playwright install chromium
```

Fetch the failing source:

```bash
python scripts/scrape/fallback_fetch.py <source_name>
```

`<source_name>` must be a key in `run.py`'s `SOURCES` dict, e.g.
`realgm_future_drafts`. This writes `snapshots/raw/{source_name}.html` —
the same path the normal fetch path would have written — so it's a
drop-in replacement for a single failing source, not a full pipeline
rerun.

Then re-run the normal offline pipeline step so the freshly fetched
snapshot gets parsed and merged like normal:

```bash
python scripts/scrape/run.py --offline
```

## Notes

- Verified working against `realgm_future_drafts` (RealGM's Cloudflare
  challenge is the reason this exists). Not tested against
  BBRef/Hoops Rumors/SalarySwish since none of those are currently
  blocked — this is specifically insurance for RealGM-style Cloudflare
  escalation.
- Uses a real Chrome user-agent, not the pipeline's own identifying UA —
  this path exists specifically for when a site needs to see full
  in-browser behavior, not just a spoofed header.
