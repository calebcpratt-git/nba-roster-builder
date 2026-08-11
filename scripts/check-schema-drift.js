// Guards lib/data-schema.ts — the hand-maintained manifest behind the /data
// dashboard — against drifting away from what the pipeline actually produces.
//
//   node scripts/check-schema-drift.js          schema + source-URL checks (CI)
//   node scripts/check-schema-drift.js --live   also request every source page
//
// Exits non-zero when the manifest is out of step, so a PR that changes a
// schema interface or a source URL without updating the manifest fails.
// Zero-population fields and live-fetch problems are reported but never fail
// the run: an empty field is often a documented gap, and a flaky fetch is not
// a code defect.
//
// The manifest is TypeScript, so this compiles it with the repo's own tsc into
// a temp dir and requires the result rather than regex-parsing it. That keeps a
// single source of truth (and typechecks the manifest as a side effect) without
// adding a TS-runner dependency.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const LIVE = process.argv.includes('--live')
const MIN_BYTES = 20_000 // same challenge-page heuristic run.py uses

const findings = []
const notes = []
const fail = (kind, detail) => findings.push({ kind, detail })

// --- load the manifest ------------------------------------------------------

function loadManifest() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-drift-'))
  const tsc = path.join(ROOT, 'node_modules', '.bin', 'tsc')
  if (!fs.existsSync(tsc)) {
    console.error('tsc not found in node_modules — run the package manager install first.')
    process.exit(2)
  }

  try {
    execFileSync(
      tsc,
      [
        'lib/data-schema.ts',
        'lib/schema-coverage.ts',
        '--outDir', outDir,
        '--module', 'commonjs',
        '--target', 'es2020',
        '--moduleResolution', 'node',
        '--skipLibCheck',
        '--esModuleInterop',
      ],
      { cwd: ROOT, stdio: 'pipe' }
    )
  } catch (err) {
    // tsc emits JS even when it reports type errors, so only bail if the
    // output we need is genuinely missing.
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim()
    if (!fs.existsSync(path.join(outDir, 'data-schema.js'))) {
      console.error('Could not compile the manifest:\n' + output)
      process.exit(2)
    }
    if (output) fail('manifest-type-error', output.split('\n')[0])
  }

  return {
    ...require(path.join(outDir, 'data-schema.js')),
    ...require(path.join(outDir, 'schema-coverage.js')),
    outDir,
  }
}

const { DATA_SOURCES, DATA_ENTITIES, undeclaredPaths, entityCoverage } = loadManifest()

// --- 1. schema drift: fields in the data that the manifest doesn't describe --

for (const entity of DATA_ENTITIES) {
  for (const p of undeclaredPaths(entity)) {
    fail(
      'undeclared-field',
      `${entity.id}.${p} exists in the real data but no FieldSpec describes it — add it to ${entity.file}'s entry in lib/data-schema.ts.`
    )
  }
}

// --- 2. declared fields that no longer appear anywhere -----------------------

for (const entity of DATA_ENTITIES) {
  const coverage = entityCoverage(entity)
  if (coverage.rowCount === 0) continue
  for (const field of coverage.fields) {
    if (field.populated === 0 && !field.expectedEmpty) {
      notes.push(
        `${entity.id}.${field.path} is declared but carries no value in any of ${coverage.rowCount} rows` +
          (field.sources.length === 0 ? ' (no source attributed).' : ` (source: ${field.sources.join(', ')}).`)
      )
    }
  }
}

// --- 3. source URLs vs. scripts/scrape/run.py -------------------------------

function pythonConstants(file) {
  const text = fs.readFileSync(path.join(ROOT, 'scripts', 'scrape', file), 'utf8')
  const constants = {}
  for (const m of text.matchAll(/^([A-Z_][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/gm)) {
    constants[m[1]] = m[2]
  }
  return { text, constants }
}

function runPySources() {
  const { text, constants } = pythonConstants('run.py')
  const swish = pythonConstants('salaryswish.py').constants

  const start = text.indexOf('SOURCES = {')
  if (start === -1) {
    fail('run-py-unparsed', "Could not find the SOURCES dict in scripts/scrape/run.py — this checker needs updating.")
    return null
  }
  const block = text.slice(start, text.indexOf('\n}', start))

  const sources = {}
  for (const line of block.split('\n').slice(1)) {
    const trimmed = line.trim()
    // The `**{f'bbref_draft_{y}': ...}` comprehension is generated per draft
    // year; the manifest pins the current one, which is checked by hand.
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('**')) continue

    const m = trimmed.match(/^'([^']+)'\s*:\s*(.+?),?$/)
    if (!m) continue
    const [, key, rawValue] = m
    const value = rawValue.trim()

    if (/^['"]/.test(value)) {
      sources[key] = value.slice(1, -1)
    } else if (value.startsWith('salaryswish.')) {
      sources[key] = swish[value.slice('salaryswish.'.length)]
    } else {
      sources[key] = constants[value]
    }
  }
  return sources
}

const runPy = runPySources()

if (runPy) {
  const declared = Object.values(DATA_SOURCES).filter((s) => s.runPyKey)
  const declaredByKey = new Map(declared.map((s) => [s.runPyKey, s]))

  for (const source of declared) {
    const actual = runPy[source.runPyKey]
    if (actual === undefined) {
      fail(
        'source-missing-in-run-py',
        `DATA_SOURCES['${source.id}'] claims run.py key '${source.runPyKey}', which is not in run.py's SOURCES.`
      )
    } else if (actual !== source.url) {
      fail(
        'source-url-mismatch',
        `'${source.runPyKey}' — run.py fetches ${actual} but lib/data-schema.ts says ${source.url}.`
      )
    }
  }

  for (const key of Object.keys(runPy)) {
    if (!declaredByKey.has(key)) {
      fail(
        'source-missing-in-manifest',
        `run.py fetches '${key}' (${runPy[key]}) but no DATA_SOURCES entry declares it.`
      )
    }
  }
}

// --- 4. optional: are the pages still there? --------------------------------

async function probe(source) {
  try {
    const res = await fetch(source.url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'nba-roster-builder-pipeline/1.0 (schema drift check)' },
    })

    if (res.status >= 300 && res.status < 400) {
      return `${source.id} redirects (${res.status}) to ${res.headers.get('location')}`
    }
    if (!res.ok) return `${source.id} returned HTTP ${res.status}`

    const body = await res.arrayBuffer()
    if (body.byteLength < MIN_BYTES) {
      return `${source.id} returned only ${body.byteLength.toLocaleString()} bytes — likely a challenge or error page`
    }
    return null
  } catch (err) {
    return `${source.id} could not be fetched: ${err.message}`
  }
}

async function checkLive() {
  const probes = Object.values(DATA_SOURCES).filter((s) => s.url && !s.isTemplate)
  console.log(`\nProbing ${probes.length} source pages…`)
  for (const source of probes) {
    const problem = await probe(source)
    if (problem) notes.push(problem)
    await new Promise((r) => setTimeout(r, 1000)) // be a polite guest
  }

  // The three dated Hoops Rumors posts the pipeline is still reading from last
  // season. Nothing detects their successors automatically, so look for them.
  const successors = [
    ['hr-trade-kickers', 'https://www.hoopsrumors.com/2026/08/nba-players-with-trade-kickers-in-2026-27.html'],
    ['hr-veto-trades', 'https://www.hoopsrumors.com/2026/07/nba-players-who-can-veto-trades-in-2026-27.html'],
    ['hr-cash-in-trade', 'https://www.hoopsrumors.com/2026/08/cash-sent-received-in-nba-trades-for-2026-27.html'],
  ]
  for (const [id, url] of successors) {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok) {
        notes.push(`${id}: a 2026/27 post now exists at ${url} — update run.py and lib/data-schema.ts.`)
      }
    } catch {
      // A miss is the expected case; only a hit is worth reporting.
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

// --- report -----------------------------------------------------------------

async function main() {
  if (LIVE) await checkLive()

  fs.writeFileSync(
    path.join(ROOT, 'snapshots', 'schema-drift.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), live: LIVE, findings, notes }, null, 2) + '\n'
  )

  if (notes.length > 0) {
    console.log('\nNotes (not failures):')
    for (const n of notes) console.log(`  · ${n}`)
  }

  if (findings.length === 0) {
    console.log('\n✓ lib/data-schema.ts matches the real data and run.py.\n')
    return
  }

  console.log(`\n✗ ${findings.length} drift finding${findings.length === 1 ? '' : 's'}:\n`)
  for (const f of findings) console.log(`  [${f.kind}] ${f.detail}`)
  console.log('\nUpdate lib/data-schema.ts to match — see CLAUDE.md.\n')
  process.exitCode = 1
}

main()
