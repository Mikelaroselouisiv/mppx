/** Horodatage de création (ISO) pour tri stable — indépendant de updatedAt. */
export function createdAtMs(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0
  const o = raw as Record<string, unknown>
  const v = o.createdAt ?? o.created_at
  if (v == null) return 0
  const t = Date.parse(String(v))
  return Number.isFinite(t) ? t : 0
}

/** Du plus récent au plus ancien — les nouveaux enregistrements apparaissent en premier. */
export function sortByCreatedAtDesc<T>(items: T[]): T[] {
  return [...items].sort((a, b) => createdAtMs(b) - createdAtMs(a))
}
