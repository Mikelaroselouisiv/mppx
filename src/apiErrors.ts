import { ApiError } from './api'

/** Message affiché à l'utilisateur — jamais de détail technique (403 Forbidden, status=…). */
export function getUserFacingApiMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Identifiants incorrects ou session expirée.'
    if (error.status === 403) return 'Vous n’avez pas l’autorisation d’effectuer cette action.'
    if (error.status === 404) return 'Donnée introuvable ou service indisponible.'
    if (error.status === 409) {
      const raw = error.message?.trim()
      if (raw && !/^forbidden$/i.test(raw) && !/^http\s/i.test(raw)) return raw
      return 'Cette ressource existe déjà ou est en conflit.'
    }
    if (error.status >= 500) return 'Le serveur est momentanément indisponible. Réessayez plus tard.'
    const raw = error.message?.trim()
    if (raw && !/^forbidden$/i.test(raw) && !/^http\s/i.test(raw)) return raw
    return 'Une erreur est survenue. Réessayez ou contactez l’administrateur.'
  }
  if (error instanceof Error) {
    const raw = error.message?.trim()
    if (raw) return raw
  }
  return 'Une erreur inattendue est survenue.'
}
