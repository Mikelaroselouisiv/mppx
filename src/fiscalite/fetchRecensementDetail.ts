import { apiFetch } from '../api'
import type { FiscalModuleId } from './store'

/** Détail complet d’une fiche recensement pour contextualiser le montant (tarifs). */
export async function fetchRecensementDetail(moduleId: FiscalModuleId, entityId: string): Promise<unknown> {
  const id = encodeURIComponent(entityId)
  if (moduleId === 'PROJET_CONSTRUCTION') {
    return apiFetch<unknown>(`/recensement/construction-projects/${id}`)
  }
  if (moduleId === 'DOMAINE_ETAT') {
    return apiFetch<unknown>(`/recensement/domaine-etat-biens/${id}`)
  }
  return apiFetch<unknown>(`/recensement/entities/${id}`)
}
