/**
 * Extrait nom / prénom / contacts depuis la réponse API « projet de construction »
 * (camelCase NestJS ou snake_case éventuel).
 */
export function proprietaireFromProjectPayload(raw: unknown): {
  displayName: string | null
  phone: string | null
  email: string | null
} {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const prenom = String(p.proprietairePrenom ?? p['proprietaire_prenom'] ?? '').trim()
  const nom = String(p.proprietaireNom ?? p['proprietaire_nom'] ?? '').trim()
  let displayName: string | null = null
  if (prenom && nom) displayName = `${prenom} ${nom}`
  else if (nom) displayName = nom
  else if (prenom) displayName = prenom
  const phone =
    String(
      p.proprietaireTelephone ?? p['proprietaire_telephone'] ?? p.telephone ?? '',
    ).trim() || null
  const email = String(p.proprietaireEmail ?? p['proprietaire_email'] ?? '').trim() || null
  return { displayName, phone, email }
}
