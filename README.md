# Association GM

A Next.js/React/TypeScript app for building and validating NBA rosters and
salary-cap sheets — track contracts, cap holds, exceptions, apron status, and
model trades against the current CBA rules.

Live at [association-gm.vercel.app](https://association-gm.vercel.app/) —
deployed automatically on every merge to `main`.

## Data pipeline

The app reads generated data files in `lib/` (`player-data.ts`,
`contract-details.ts`, `team-cap-state.ts`, `draft-picks.ts`,
`rookie-years.ts`, `free-agents.ts`). These are rewritten daily by a GitHub
Actions scrape (`scripts/scrape/run.py`) that pulls from Basketball-Reference,
RealGM, Hoops Rumors, nbacaptracker.com, and SalarySwish. Don't hand-edit the
generated files — edit the scrapers/generators instead.

A local-only `/data` dashboard (`app/data/**`) shows the data schema, sources,
and live population counts for every field. It's excluded from production
builds via the `page.dev.tsx`/`route.dev.ts` naming convention in
`next.config.mjs`.

See [CLAUDE.md](CLAUDE.md) for the schema-manifest maintenance rules and other
working notes.

## Getting Started

Install dependencies and run the dev server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Other scripts

```bash
pnpm lint            # eslint
pnpm schema:check     # verify lib/data-schema.ts matches the real data and run.py
pnpm schema:check:live # also checks sources for newer Hoops Rumors posts
```
