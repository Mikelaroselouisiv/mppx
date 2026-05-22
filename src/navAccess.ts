/** Droits de navigation desktop selon le rôle utilisateur (chaîne API, insensible à la casse). */

export type NavAccess = {
  administration: boolean
  administrationUsers: boolean
  administrationRoles: boolean
  administrationMarches: boolean
  administrationCimetieres: boolean
  recensement: boolean
  /** Création / modification / suppression des fiches recensement (lecture seule pour inspecteur). */
  recensementWrite: boolean
  fiscalite: boolean
  recouvrement: boolean
  /** Carte des fiches recensées (points GPS). */
  geographicMonitor: boolean
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

  const fullAccess = new Set(['maire', 'directeur_general', 'administrateur', 'super_admin'])
  if (fullAccess.has(r)) {
    return {
      administration: true,
      administrationUsers: true,
      administrationRoles: true,
      administrationMarches: true,
      administrationCimetieres: true,
      recensement: true,
      recensementWrite: true,
      fiscalite: true,
      recouvrement: true,
      geographicMonitor: true,
    }
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
      fiscalite: true,
      recouvrement: true,
      geographicMonitor: true,
    }
  }

  const isInspector = r === 'inspecteur' || r.includes('inspecteur')
  const isResponsable = r.includes('responsable') || r.includes('resp_') || r.startsWith('resp')
  if (isInspector || isResponsable) {
    return {
      administration: false,
      administrationUsers: false,
      administrationRoles: false,
      administrationMarches: false,
      administrationCimetieres: false,
      recensement: true,
      recensementWrite: !isInspector,
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
    fiscalite: false,
    recouvrement: false,
    geographicMonitor: false,
  }
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
