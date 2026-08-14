// Runs a single-source "rescue" re-scrape from this machine — for sources
// that failed on the scheduled GitHub Actions run because their host blocked
// GitHub's IP (RealGM's Cloudflare in particular) but come through fine from
// a normal residential/laptop connection.
//
// Named `route.dev.ts` so it only exists outside production (see
// next.config.mjs). It shells out to python/node against the local working
// tree, which is exactly why it must never reach a deployed environment.

import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readScrapeStatus } from '@/lib/schema-dashboard'

const run = promisify(execFile)
const TIMEOUT_MS = 5 * 60 * 1000 // one source's retries can take a couple minutes

export async function POST(req: Request) {
  const { runPyKey } = (await req.json().catch(() => ({}))) as { runPyKey?: string }

  if (!runPyKey || typeof runPyKey !== 'string') {
    return NextResponse.json({ ok: false, message: 'Missing runPyKey.' })
  }

  // Validate against the last run's own source list rather than trusting the
  // request — execFile's argv array means this can't be a shell-injection
  // vector either way, but a typo'd or made-up key should fail loudly, not
  // silently no-op inside run.py.
  const knownSources = Object.keys(readScrapeStatus().sourceFetches ?? {})
  if (!knownSources.includes(runPyKey)) {
    return NextResponse.json({
      ok: false,
      message: `Unknown source "${runPyKey}" — not in the last run's sourceFetches.`,
    })
  }

  try {
    const cwd = process.cwd()

    const fetchResult = await run(
      'python3',
      ['scripts/scrape/run.py', `--rescue=${runPyKey}`],
      { cwd, timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    )

    const stillFailed = readScrapeStatus().sourceFetches?.[runPyKey] === false
    if (stillFailed) {
      return NextResponse.json({
        ok: false,
        message: `${runPyKey} still failed to fetch — see output below.`,
        output: fetchResult.stdout + fetchResult.stderr,
      })
    }

    // --rescue tells the generator to leave the diff baseline (snapshots/<kind>.json)
    // where it was this morning instead of advancing it, and to merge this
    // run's diff-<kind>.json onto the morning run's instead of overwriting
    // it — see generate-from-scrape.js's rescueMode comment.
    const genResult = await run('node', ['scripts/generate-from-scrape.js', '--rescue'], {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    })

    return NextResponse.json({
      ok: true,
      message: `Fetched ${runPyKey} and regenerated data files. Review the diff below, then commit/PR as usual.`,
      output: fetchResult.stdout + fetchResult.stderr + '\n' + genResult.stdout + genResult.stderr,
    })
  } catch (err) {
    const output =
      err && typeof err === 'object' && 'stdout' in err
        ? String((err as { stdout?: string }).stdout ?? '') + String((err as { stderr?: string }).stderr ?? '')
        : undefined
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : 'Rescue run failed.',
      output,
    })
  }
}
