// Pulls the generated data files from origin/main — i.e. this morning's
// scrape — without touching anything else in the working tree.
//
// Named `route.dev.ts` so it only exists outside production (see
// next.config.mjs). It shells out to git, which is exactly why it must never
// reach a deployed environment.
//
// Taking generated data from main onto a feature branch is not a special case:
// .github/workflows/sync-generated-data.yml force-syncs these same paths on
// every PR, precisely so a stale branch can't roll back a day's scrape.

import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { GENERATED_DATA_FILES } from '@/lib/schema-dashboard'

const run = promisify(execFile)

const REFRESH_PATHS = [...GENERATED_DATA_FILES, 'snapshots/scraped']

async function git(args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024 })
  return stdout.trim()
}

export async function POST() {
  try {
    // Refuse rather than overwrite: these are generated files, but if they
    // have local edits the user is mid-something and losing that silently
    // would be worse than not refreshing.
    const dirty = (await git(['status', '--porcelain', '--', ...REFRESH_PATHS]))
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))

    if (dirty.length > 0) {
      return NextResponse.json({
        ok: false,
        message: 'Refused — these files have uncommitted local changes. Commit or discard them first.',
        blockedBy: dirty,
      })
    }

    await git(['fetch', 'origin', 'main'])

    const before = await git(['rev-parse', 'origin/main'])
    await git(['checkout', 'origin/main', '--', ...REFRESH_PATHS])

    const changed = (await git(['status', '--porcelain', '--', ...REFRESH_PATHS]))
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))

    return NextResponse.json({
      ok: true,
      message:
        changed.length === 0
          ? `Already up to date with origin/main (${before.slice(0, 7)}).`
          : `Pulled ${changed.length} file${changed.length === 1 ? '' : 's'} from origin/main (${before.slice(0, 7)}).`,
      changed,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : 'git failed',
    })
  }
}
