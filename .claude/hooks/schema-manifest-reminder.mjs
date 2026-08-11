// PostToolUse hook: when a schema interface or a scraper source is edited,
// remind that lib/data-schema.ts — the manifest behind the /data dashboard —
// has to be updated in the same change. See CLAUDE.md.
//
// CLAUDE.md covers the same rule, but a file read at session start can fall
// out of context; this fires at the moment of the edit. Reads the hook payload
// on stdin and emits additionalContext only on a match, so it is silent for
// every other edit.

const SCHEMA_FILES = [
  'lib/types.ts',
  'lib/player-data.ts',
  'lib/contract-details.ts',
  'lib/team-cap-state.ts',
  'lib/draft-picks.ts',
  'lib/free-agents.ts',
  'lib/league-cap.ts',
  'lib/season-calendar.ts',
  'lib/rookie-salaries.ts',
  'lib/data.ts',
]

const SOURCE_PATTERNS = [/scripts\/scrape\/.+\.py$/, /scripts\/generate-.+\.js$/]

function classify(filePath) {
  if (!filePath) return null
  const normalized = filePath.replace(/\\/g, '/')

  // Editing the manifest itself is the fix, not the trigger.
  if (normalized.endsWith('lib/data-schema.ts')) return null

  if (SCHEMA_FILES.some((f) => normalized.endsWith(f))) return 'schema'
  if (SOURCE_PATTERNS.some((p) => p.test(normalized))) return 'source'
  return null
}

let input = ''
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const filePath = payload?.tool_input?.file_path ?? payload?.tool_response?.filePath
  const kind = classify(filePath)
  if (!kind) process.exit(0)

  const detail =
    kind === 'schema'
      ? `You just edited ${filePath}, which declares part of the app's data schema. If this changed, added, removed, or re-typed a field, update its FieldSpec in lib/data-schema.ts in this same change.`
      : `You just edited ${filePath}, which is part of the scrape pipeline. If this changed a source URL, added or removed a source, or changed which fields get populated, update DATA_SOURCES / the affected FieldSpec in lib/data-schema.ts in this same change.`

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `${detail} Then verify with \`node scripts/check-schema-drift.js\` — it runs in CI and fails the PR on drift. See CLAUDE.md.`,
      },
      suppressOutput: true,
    })
  )
})
