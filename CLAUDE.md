# Association GM — working notes

Next.js/React/TypeScript NBA roster and cap-sheet builder. The app reads
generated data files in `lib/`, which a daily GitHub Actions scrape rewrites
from Basketball-Reference, RealGM, Hoops Rumors, nbacaptracker.com, and
SalarySwish.

## Keep the data-schema manifest in step

`lib/data-schema.ts` is the manifest behind the local `/data` dashboard: it
records every entity and field in the data model and the web page each field
comes from. It is the only hand-maintained part of that dashboard — population
counts are always computed live — so it is also the only part that can go
stale.

**Any change to a schema shape or a data source must update
`lib/data-schema.ts` in the same change.** Never leave it to a follow-up.

That applies when you:

- add, remove, rename, or re-type a field on a schema interface — `lib/types.ts`,
  or the exported interfaces at the top of `lib/player-data.ts`,
  `lib/contract-details.ts`, `lib/team-cap-state.ts`, `lib/draft-picks.ts`,
  `lib/free-agents.ts`, `lib/league-cap.ts`, `lib/season-calendar.ts`;
- change a source URL or add/remove a source in `scripts/scrape/run.py`'s
  `SOURCES`, or in the module-level URL constants in `scripts/scrape/*.py`;
- change what a generator writes in `scripts/generate-*.js`, such that a field
  starts or stops being populated.

What to update: the field's `FieldSpec` (path, type, description, `sources`),
its entity's `EntitySpec`, and/or the `DATA_SOURCES` record.

Verify with:

```bash
node scripts/check-schema-drift.js
```

It fails when the manifest disagrees with the real data or with `run.py`, and
runs on every PR into `main` via `.github/workflows/schema-drift.yml`. Add
`--live` to also request each source page and check whether successors to the
dated Hoops Rumors posts have been published.

## The /data dashboard is local-only

`app/data/**` and `app/api/data-refresh/**` use the `page.dev.tsx` /
`route.dev.ts` naming. `next.config.mjs` only registers `dev.tsx`/`dev.ts` as
page extensions outside production, so these routes do not exist in the
deployed app and nothing about them ships. Keep that naming for anything added
to the dashboard — a plain `page.tsx` under `app/data/` would publish it.

## Generated files

`lib/player-data.ts`, `lib/contract-details.ts`, `lib/team-cap-state.ts`,
`lib/draft-picks.ts`, `lib/rookie-years.ts`, and `lib/free-agents.ts` are
generated — edit the scrapers or generators, not these files. They are
force-synced from `main` on every PR by `.github/workflows/sync-generated-data.yml`
so a stale branch cannot roll back a day's scrape.
