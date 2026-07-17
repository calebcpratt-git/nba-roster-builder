/**
 * Normalizes a player display name into a stable join key:
 * strips diacritics, lowercases, collapses to hyphens.
 * "Nikola Jokić" -> "nikola-jokic"
 */
export function playerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (Jokić -> Jokic)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Wraps a raw-name-keyed table (e.g. PLAYER_ROOKIE_YEARS) in a lookup function
 * that normalizes both the stored keys and the query name via playerKey().
 * The index is built once per call site (memoize the returned function at
 * module scope — don't call nameLookup() inside a render or a hot loop).
 */
export function nameLookup<T>(table: Record<string, T>): (name: string) => T | undefined {
  const index = new Map<string, T>()
  for (const [name, value] of Object.entries(table)) {
    index.set(playerKey(name), value)
  }
  return (name: string) => index.get(playerKey(name))
}
