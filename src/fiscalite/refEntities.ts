import type { FiscalModuleId } from './store'
import { proprietaireFromProjectPayload } from './constructionProjectFromApi'
import { coverPhotoKeyFromPhotos } from './photoUtils'

export type FiscalRefEntity = {
  id: string
  denomination: string
  numeroDossier?: string | null
  taxpayerName?: string | null
  taxpayerPhone?: string | null
  taxpayerEmail?: string | null
  coverPhotoKey?: string | null
  createdAt?: string | null
}

/** Carte agrégée pour charges sans lien recensement (entityId null). */
export const ORPHAN_ENTITY_ID = '__orphan__'

/** Aligné sur `FiscalEntity` (API Nest / colonnes snake_case éventuelles). */
export function proprietaireFromFiscalEntityRow(raw: any): {
  displayName: string | null
  phone: string | null
  email: string | null
} {
  const prenom = String(raw?.proprietairePrenom ?? raw?.proprietaire_prenom ?? '').trim()
  const nom = String(raw?.proprietaireNom ?? raw?.proprietaire_nom ?? '').trim()
  let displayName: string | null = null
  if (prenom && nom) displayName = `${prenom} ${nom}`
  else if (nom) displayName = nom
  else if (prenom) displayName = prenom
  const phone =
    String(
      raw?.proprietaireTelephone ?? raw?.proprietaire_telephone ?? raw?.telephone ?? '',
    ).trim() || null
  const email =
    String(raw?.proprietaireEmail ?? raw?.proprietaire_email ?? raw?.email ?? '').trim() || null
  return { displayName, phone, email }
}

/** Libellé chantier / fiche pour PDF et selects — sans dupliquer le N° dossier. */
export function defaultEntityLabelFromRef(moduleId: FiscalModuleId, hit: FiscalRefEntity): string {
  const num = hit.numeroDossier?.trim() || ''
  const rest = hit.denomination?.trim() || ''
  if (moduleId === 'PROJET_CONSTRUCTION') {
    if (num && rest) return `${num} — ${rest}`
    return rest || num || ''
  }
  if (num && rest) return `${num} — ${rest}`
  return rest || num || ''
}

export function constructionProjectRefLabel(p: any): string {
  const num = String(p?.numeroDossier ?? '').trim()
  if (num) return num
  const d = String(p?.denomination ?? '').trim()
  const n = String(p?.natureTravaux ?? '').trim()
  const text = n || d
  if (text) return text.length > 52 ? text.slice(0, 52) + '…' : text
  const id = String(p?.id ?? '')
  return id ? `Projet ${id.slice(0, 8)}…` : '—'
}

/** Sous-titre carte / libellé secondaire (travaux), sans répéter le N° dossier. */
function constructionProjectSecondaryLine(p: any): string {
  const num = String(p?.numeroDossier ?? '').trim()
  const nat = String(p?.natureTravaux ?? p?.nature_travaux ?? '').trim()
  const den = String(p?.denomination ?? '').trim()
  if (nat && den && nat !== den) return `${nat} · ${den}`
  const one = nat || den
  if (!one) return ''
  if (num && one === num) return ''
  return one
}

export function normalizeProjects(payload: any): FiscalRefEntity[] {
  const mapRow = (p: any): FiscalRefEntity => {
    const pr = proprietaireFromProjectPayload(p)
    const numRaw = String(p?.numeroDossier ?? '').trim()
    const numeroDossier = numRaw || null
    const secondary = constructionProjectSecondaryLine(p)
    const denomination = numeroDossier ? secondary || '—' : constructionProjectRefLabel(p)
    return {
      id: String(p.id),
      denomination,
      numeroDossier,
      taxpayerName: pr.displayName,
      taxpayerPhone: pr.phone,
      taxpayerEmail: pr.email,
      coverPhotoKey: coverPhotoKeyFromPhotos(p?.photos),
      createdAt:
        p?.createdAt != null
          ? String(p.createdAt)
          : p?.created_at != null
            ? String(p.created_at)
            : null,
    }
  }
  if (Array.isArray(payload)) {
    return payload.map(mapRow)
  }
  for (const k of ['items', 'data', 'projects', 'results']) {
    if (Array.isArray(payload?.[k])) {
      return payload[k].map(mapRow)
    }
  }
  return []
}

export function normalizeEntities(payload: any): FiscalRefEntity[] {
  let raw: any[] = []
  if (Array.isArray(payload)) raw = payload
  else {
    for (const k of ['items', 'data', 'entities', 'results']) {
      if (Array.isArray(payload?.[k])) {
        raw = payload[k]
        break
      }
    }
  }
  return raw.map((x: any) => {
    const pr = proprietaireFromFiscalEntityRow(x)
    return {
      id: String(x.id),
      denomination: String(x.denomination ?? x.designation ?? '').trim() || '—',
      numeroDossier: String(x?.numeroDossier ?? x?.numero_dossier ?? '').trim() || null,
      taxpayerName: pr.displayName,
      taxpayerPhone: pr.phone,
      taxpayerEmail: pr.email,
      coverPhotoKey: coverPhotoKeyFromPhotos(x?.photos),
      createdAt:
        x?.createdAt != null
          ? String(x.createdAt)
          : x?.created_at != null
            ? String(x.created_at)
            : null,
    }
  })
}
