import { proprietaireFromProjectPayload } from './constructionProjectFromApi'
import { coverPhotoKeyFromPhotos } from './photoUtils'
import { proprietaireFromFiscalEntityRow, type FiscalRefEntity } from './refEntities'

export type EntityCardDisplay = {
  numeroDossier: string | null
  primaryName: string
  subtitle: string | null
  ownerName: string | null
  phone: string | null
  email: string | null
  coverPhotoKey: string | null
}

function commercantDisplayName(raw: Record<string, unknown>): string | null {
  const prenom = String(raw.commercantPrenom ?? raw.commercant_prenom ?? '').trim()
  const nom = String(raw.commercantNom ?? raw.commercant_nom ?? '').trim()
  if (prenom && nom) return `${prenom} ${nom}`
  if (nom) return nom
  if (prenom) return prenom
  return null
}

function ownerFromEntityRaw(raw: Record<string, unknown>): string | null {
  const comm = commercantDisplayName(raw)
  if (comm) return comm
  return proprietaireFromFiscalEntityRow(raw).displayName
}

export function entityCardFromRaw(raw: unknown): EntityCardDisplay {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const numeroDossier =
    String(o.numeroDossier ?? o.numero_dossier ?? '').trim() || null
  const denomination =
    String(o.denomination ?? o.designation ?? '').trim() || '—'
  const pr = proprietaireFromProjectPayload(o)
  const ownerFromEntity = ownerFromEntityRaw(o)
  const ownerName = pr.displayName || ownerFromEntity
  const phone =
    pr.phone ||
    proprietaireFromFiscalEntityRow(o).phone ||
    String(o.telephone ?? '').trim() ||
    null
  const email =
    pr.email ||
    proprietaireFromFiscalEntityRow(o).email ||
    String(o.email ?? '').trim() ||
    null
  const nature = String(o.natureTravaux ?? o.nature_travaux ?? '').trim()
  const subtitle = nature && nature !== denomination ? nature : null
  const primaryName = ownerName || denomination
  return {
    numeroDossier,
    primaryName,
    subtitle: subtitle || (denomination !== primaryName ? denomination : null),
    ownerName,
    phone,
    email,
    coverPhotoKey: coverPhotoKeyFromPhotos(o.photos),
  }
}

export function entityCardFromFiscalRef(e: FiscalRefEntity): EntityCardDisplay {
  return {
    numeroDossier: e.numeroDossier ?? null,
    primaryName: e.taxpayerName?.trim() || e.denomination,
    subtitle: e.taxpayerName?.trim() ? e.denomination : null,
    ownerName: e.taxpayerName ?? null,
    phone: e.taxpayerPhone ?? null,
    email: e.taxpayerEmail ?? null,
    coverPhotoKey: e.coverPhotoKey ?? null,
  }
}
