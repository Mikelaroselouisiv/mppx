export type PhotoKeyRef = { key: string }

/** Première clé photo utilisable comme couverture de carte. */
export function coverPhotoKeyFromPhotos(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const key = String((row as Record<string, unknown>).key ?? '').trim()
    if (key) return key
  }
  return null
}

export function photoKeysFromRaw(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const key = String((row as Record<string, unknown>).key ?? '').trim()
    if (key) out.push(key)
  }
  return out
}
