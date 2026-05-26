/** Droits de navigation desktop selon le rôle utilisateur (chaîne API, insensible à la casse). */

export type RecensementModuleId =
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

export type NavAccess = {
  administration: boolean
  administrationUsers: boolean
  administrationRoles: boolean
  administrationMarches: boolean
  administrationCimetieres: boolean
  recensement: boolean
  /** Création / modification / suppression des fiches recensement (lecture seule pour inspecteur). */
  recensementWrite: boolean
  /** null = tous les modules recensement ; sinon liste blanche par rôle métier. */
  recensementModules: RecensementModuleId[] | null
  fiscalite: boolean
  recouvrement: boolean
  /** Carte des fiches recensées (points GPS). */
  geographicMonitor: boolean
}

/** Rubriques recensement du responsable urbanisme (accès recensement complet sur ces modules). */
export const RESP_URBANISME_REC_MODULES: readonly RecensementModuleId[] = [
  'PROJET_CONSTRUCTION',
  'DOMAINE_ETAT',
  'LOGEMENT',
  'ECOLE',
  'CIMETIERE',
  'EGLISE',
] as const

const FULL_ACCESS_ROLES = new Set(['maire', 'directeur_general', 'administrateur', 'super_admin'])

function fullNavAccess(): NavAccess {
  return {
    administration: true,
    administrationUsers: true,
    administrationRoles: true,
    administrationMarches: true,
    administrationCimetieres: true,
    recensement: true,
    recensementWrite: true,
    recensementModules: null,
    fiscalite: true,
    recouvrement: true,
    geographicMonitor: true,
  }
}

export function normalizeDesktopRole(role: string): string {
  return String(role ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s-]+/g, '_')
}

/**
 * Règles métier (navigation desktop) :
 * - Full accès : maire, directeur_general, administrateur, super_admin
 * - ressources_humaines : Accueil + Administration (uniquement Utilisateurs + Rôles)
 * - caissier, secretaire, collecteur : Accueil + Recouvrement
 * - inspecteurs et tout rôle contenant resp/responsable : Accueil + Recensement
 * - autres rôles : Accueil uniquement
 */
export function getNavAccess(role: string): NavAccess {
  const r = normalizeDesktopRole(role)

  if (FULL_ACCESS_ROLES.has(r)) {
    return fullNavAccess()
  }

  if (r === 'ressources_humaines') {
    return {
      administration: true,
      administrationUsers: true,
      administrationRoles: true,
      administrationMarches: false,
      administrationCimetieres: false,
      recensement: false,
      recensementWrite: false,
      recensementModules: null,
      fiscalite: false,
      recouvrement: false,
      geographicMonitor: false,
    }
  }

  const recouvrementDeskRoles = new Set(['caissier', 'secretaire', 'collecteur'])
  if (recouvrementDeskRoles.has(r)) {
    return {
      administration: false,
      administrationUsers: false,
      administrationRoles: false,
      administrationMarches: false,
      administrationCimetieres: false,
      recensement: false,
      recensementWrite: false,
      recensementModules: null,
      fiscalite: false,
      recouvrement: true,
      geographicMonitor: true,
    }
  }

  // Exception : "resp_fiscalite" n'a pas accès au recensement, mais gère fiscalité + recouvrement.
  if (r === 'resp_fiscalite') {
    return {
      administration: false,
      administrationUsers: false,
      administrationRoles: false,
      administrationMarches: false,
      administrationCimetieres: false,
      recensement: false,
      recensementWrite: false,
      recensementModules: null,
      fiscalite: true,
      recouvrement: true,
      geographicMonitor: true,
    }
  }

  const isInspector = r === 'inspecteur' || r.includes('inspecteur')
  const isResponsable = r.includes('responsable') || r.includes('resp_') || r.startsWith('resp')
  if (isInspector || isResponsable) {
    const urbanismeModules =
      r === 'resp_urbanisme' ? [...RESP_URBANISME_REC_MODULES] : null
    return {
      administration: false,
      administrationUsers: false,
      administrationRoles: false,
      administrationMarches: false,
      administrationCimetieres: false,
      recensement: true,
      recensementWrite: !isInspector,
      recensementModules: urbanismeModules,
      fiscalite: false,
      recouvrement: false,
      geographicMonitor: true,
    }
  }

  return {
    administration: false,
    administrationUsers: false,
    administrationRoles: false,
    administrationMarches: false,
    administrationCimetieres: false,
    recensement: false,
    recensementWrite: false,
    recensementModules: null,
    fiscalite: false,
    recouvrement: false,
    geographicMonitor: false,
  }
}

export function filterRecensementModules<T extends { id: RecensementModuleId }>(
  modules: readonly T[],
  allowed: RecensementModuleId[] | null,
): T[] {
  if (!allowed?.length) return [...modules]
  const set = new Set(allowed)
  return modules.filter((m) => set.has(m.id))
}

export function canAccessNavTab(tab: string, nav: NavAccess): boolean {
  if (tab === 'home') return true
  if (tab === 'administration') return nav.administration
  if (tab === 'administration-users') return nav.administrationUsers
  if (tab === 'administration-roles') return nav.administrationRoles
  if (tab === 'administration-marches') return nav.administrationMarches
  if (tab === 'administration-cimetieres') return nav.administrationCimetieres
  if (tab.startsWith('administration-')) return nav.administration
  if (tab === 'recensement') return nav.recensement
  if (tab === 'fiscalite') return nav.fiscalite
  if (tab === 'recouvrement') return nav.recouvrement
  if (tab === 'geographic-monitor') return nav.geographicMonitor
  return false
}
