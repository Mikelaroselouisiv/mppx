import { apiFetch } from '../api'
import { entityCardFromRaw } from '../fiscalite/entityCardFields'
import { coverPhotoKeyFromPhotos } from '../fiscalite/photoUtils'
import { gpsFromRaw } from './gpsPoint'

export type GeoMonitorModuleId =
  | 'PROJET_CONSTRUCTION'
  | 'DOMAINE_ETAT'
  | 'ENTREPRISE'
  | 'ORGANISATION'
  | 'COMMERCANT'
  | 'LOGEMENT'
  | 'ECOLE'
  | 'EGLISE'
  | 'CIMETIERE'
  | 'JEUX_HASARD'

export type GeoMapPoint = {
  id: string
  latitude: number
  longitude: number
  label: string
  numeroDossier: string | null
  phone: string | null
  email: string | null
  coverPhotoKey: string | null
}

export const GEO_MONITOR_MODULES: Array<{
  id: GeoMonitorModuleId
  label: string
  desc: string
  color: string
}> = [
  { id: 'PROJET_CONSTRUCTION', label: 'Projets de construction', desc: 'Chantiers et permis', color: '#0b4aa2' },
  { id: 'DOMAINE_ETAT', label: 'Domaine de l’État', desc: 'Parcelles et biens domaniaux', color: '#5c4d9a' },
  { id: 'ENTREPRISE', label: 'Entreprises', desc: 'Établissements recensés', color: '#1a7f4e' },
  { id: 'ORGANISATION', label: 'Organisations', desc: 'Institutions et associations', color: '#2d8a8a' },
  { id: 'COMMERCANT', label: 'Petits commerçants', desc: 'Marchés et commerce', color: '#c45c00' },
  { id: 'LOGEMENT', label: 'Propriétés bâties', desc: 'Logements et immeubles', color: '#8b4513' },
  { id: 'ECOLE', label: 'Écoles', desc: 'Établissements scolaires', color: '#2563eb' },
  { id: 'EGLISE', label: 'Églises', desc: 'Lieux de culte', color: '#6b21a8' },
  { id: 'CIMETIERE', label: 'Cimetières', desc: 'Sépultures recensées', color: '#4b5563' },
  { id: 'JEUX_HASARD', label: 'Jeux de hasard', desc: 'Points de jeux recensés', color: '#b91c1c' },
]

function normalizeList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const o = payload as Record<string, unknown>
  for (const k of ['items', 'data', 'entities', 'projects', 'results']) {
    if (Array.isArray(o[k])) return o[k]
  }
  return []
}

function rowToGeoPoint(o: Record<string, unknown>): GeoMapPoint | null {
  const gps = gpsFromRaw(o)
  if (!gps) return null
  const id = String(o.id ?? '').trim()
  if (!id) return null
  const card = entityCardFromRaw(o)
  const numeroDossier = card.numeroDossier?.trim() || null
  return {
    id,
    latitude: gps.latitude,
    longitude: gps.longitude,
    label: card.primaryName,
    numeroDossier,
    phone: card.phone?.trim() || null,
    email: card.email?.trim() || null,
    coverPhotoKey: coverPhotoKeyFromPhotos(o.photos),
  }
}

function rowsToGeoPoints(rows: unknown[]): { points: GeoMapPoint[]; total: number } {
  const points: GeoMapPoint[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const p = rowToGeoPoint(row as Record<string, unknown>)
    if (p) points.push(p)
  }
  return { points, total: rows.length }
}

export async function loadGeoPointsForModule(
  moduleId: GeoMonitorModuleId,
): Promise<{ points: GeoMapPoint[]; total: number }> {
  if (moduleId === 'PROJET_CONSTRUCTION') {
    const r = await apiFetch<unknown>('/recensement/construction-projects')
    return rowsToGeoPoints(normalizeList(r))
  }
  if (moduleId === 'DOMAINE_ETAT') {
    const r = await apiFetch<unknown>('/recensement/domaine-etat-biens')
    return rowsToGeoPoints(normalizeList(r))
  }
  const kind = moduleId === 'ORGANISATION' ? 'ORGANISATION' : moduleId
  const r = await apiFetch<unknown>(`/recensement/entities?kind=${encodeURIComponent(kind)}`)
  return rowsToGeoPoints(normalizeList(r))
}

/** Centre ville de Port-de-Paix (Haïti). */
export const PORT_DE_PAIX_CENTER = { lat: 19.937, lng: -72.830 } as const
