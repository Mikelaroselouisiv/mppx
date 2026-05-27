/** Lignes lisibles pour afficher une fiche recensement brute (réponse API). */

export type RecensementDetailRow = { label: string; value: string }

const LB: Record<string, string> = {
  id: 'Identifiant technique',
  kind: 'Type de fiche',
  numeroDossier: 'N° dossier',
  numero_dossier: 'N° dossier',
  denomination: 'Dénomination',
  designation: 'Désignation',
  categorieTravail: 'Catégorie de travaux',
  statut: 'Statut',
  natureTravaux: 'Travaux / nature',
  telephone: 'Téléphone (chantier)',
  email: 'Courriel',
  adresse: 'Adresse / localisation',
  proprietaireNom: 'Propriétaire — nom ou institution',
  proprietaire_prenom: 'Propriétaire — prénom',
  proprietairePrenom: 'Propriétaire — prénom',
  proprietaire_nom: 'Propriétaire — nom',
  proprietaireTelephone: 'Propriétaire — téléphone',
  proprietaire_telephone: 'Propriétaire — téléphone',
  proprietaireEmail: 'Propriétaire — courriel',
  proprietaire_email: 'Propriétaire — courriel',
  proprietaireNif: 'Propriétaire — NIF / NIU',
  proprietaire_nif: 'Propriétaire — NIF / NIU',
  proprietaireCin: 'Propriétaire — CIN / NIN',
  proprietaire_cin: 'Propriétaire — CIN / NIN',
  proprietaireAdresse: 'Propriétaire — adresse',
  proprietaire_adresse: 'Propriétaire — adresse',
  domaineCategorie: 'Catégorie (domaine)',
  categorie: 'Catégorie (domaine)',
  logementOccupation: 'Occupation',
  logementMur: 'Nature des murs',
  toilettesNombre: 'Toilettes — nombre',
  toilettesNature: 'Toilettes — nature',
  cuisinesNombre: 'Cuisines — nombre',
  cuisinesNature: 'Cuisines — nature',
  etagesNombre: 'Étages — nombre',
  appartementsNombre: 'Appartements — nombre',
  chambresNombre: 'Chambres — nombre',
  garagesNombre: 'Garages — nombre',
  salonsNombre: 'Salons — nombre',
  balconsNombre: 'Balcons — nombre',
  plancherNature: 'Nature du plancher',
  toitureNatures: 'Nature de la toiture',
  surfaceM2: 'Surface (m²)',
  immeubleUsage: 'Usage de l’immeuble',
  constructionType: 'Type de construction',
  constructionTypePrecise: 'Type de construction (précision)',
  elevesNombre: 'Élèves — nombre',
  membresNombre: 'Membres — nombre',
  sallesNombre: 'Salles — nombre',
  sallesSuperficieM2: 'Salles — superficie (m²)',
  proprietaireNotes: 'Propriétaire — notes',
  affichageType: 'Type d’affichage',
  affichageLignes: 'Lignes d’affichage',
  activiteDomaine: 'Activité / domaine',
  orgSigle: 'Organisation — sigle',
  orgDateFondation: 'Organisation — date de fondation',
  marcheId: 'Réf. marché',
  cimetiereId: 'Réf. cimetière',
  sepultureType: 'Type de sépulture',
  jeuxHasardType: 'Type (jeux de hasard)',
  categoryTier: 'Échelon / catégorie',
  superficieTerrainM2: 'Superficie terrain (m²)',
  superficieAutoriseeConstruireM2: 'Superficie autorisée à construire (m²)',
  surfacePrevueM2: 'Superficie projet (m²)',
  clotureMl: 'Clôture (ml)',
  niveauOuHauteur: 'Niveau / hauteur',
  superficieBatimentDemolirM2: 'Surface à démolir (m²)',
  nomIngenieurArchitecte: 'Ingénieur ou architecte',
  dureePermisConstruire: 'Durée du permis',
  parcelleSurfaceM2: 'Surface parcelle (m²)',
  superficieConstruiteM2: 'Superficie construite (m²)',
  niveauxNombre: 'Nombre de niveaux',
  anneeConstruction: 'Année de construction',
  usageBatiment: 'Usage du bâtiment',
  linkedLogementEntityId: 'Propriété bâtie liée',
  resultLogementEntityId: 'Fiche propriété issue du projet',
  notes: 'Notes',
  createdAt: 'Créé le',
  updatedAt: 'Mis à jour le',
}

function humanizeEnum(key: string, v: string): string {
  const t = v.trim()
  if (!t) return ''
  const maps: Record<string, Record<string, string>> = {
    categorie: {
      PROPRIETE_BATIE: 'Propriété bâtie',
      EMPLACEMENT: 'Emplacement / parcelle',
    },
    domaineCategorie: {
      PROPRIETE_BATIE: 'Propriété bâtie',
      EMPLACEMENT: 'Emplacement / parcelle',
    },
    logementOccupation: {
      HABITE_PAR_PROPRIETAIRE: 'Habité par le propriétaire',
      EN_FERMAGE: 'En fermage',
      EN_LOCATION: 'En location',
      EN_USUFRUIT: 'En usufruit',
    },
    logementMur: { BLOC: 'Bloc', BOIS: 'Bois', TOLE: 'Tôle' },
    constructionType: {
      BETON: 'Béton',
      BOIS: 'Bois',
      MIXTE: 'Mixte',
      AUTRE: 'Autre',
    },
  }
  return maps[key]?.[t] ?? t.replace(/_/g, ' ')
}

function strField(key: string, v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) {
    const parts = v.map((x) => strField(key, x)).filter(Boolean)
    return parts.join(', ')
  }
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'string') {
    const t = v.trim()
    return humanizeEnum(key, t) || t
  }
  return ''
}

function formatGps(g: unknown): string {
  if (!g || typeof g !== 'object') return ''
  const lat = Number((g as Record<string, unknown>).latitude)
  const lng = Number((g as Record<string, unknown>).longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  const acc = (g as Record<string, unknown>).accuracy
  const accN = acc != null ? Number(acc) : NaN
  const tail = Number.isFinite(accN) ? ` (±${Math.round(accN)} m)` : ''
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}${tail}`
}

function push(rows: RecensementDetailRow[], label: string, value: string) {
  const v = value.trim()
  if (!v.length) return
  rows.push({ label, value: v })
}

const PRIORITY: ReadonlyArray<[string, string]> = [
  ['numeroDossier', 'N° dossier'],
  ['numero_dossier', 'N° dossier'],
  ['designation', 'Désignation'],
  ['denomination', 'Dénomination'],
  ['kind', 'Type de fiche'],
  ['categorie', 'Catégorie (domaine)'],
  ['domaineCategorie', 'Catégorie (domaine)'],
  ['statut', 'Statut'],
  ['categorieTravail', 'Catégorie de travaux'],
  ['natureTravaux', 'Travaux / nature'],
  ['sepultureType', 'Type de sépulture'],
  ['jeuxHasardType', 'Type (jeux de hasard)'],
  ['affichageType', 'Type d’affichage'],
  ['activiteDomaine', 'Activité / domaine'],
  ['telephone', 'Téléphone (chantier)'],
  ['email', 'Courriel'],
  ['proprietaireNom', 'Propriétaire — nom ou institution'],
  ['proprietaire_nom', 'Propriétaire — nom ou institution'],
  ['proprietairePrenom', 'Propriétaire — prénom'],
  ['proprietaire_prenom', 'Propriétaire — prénom'],
  ['proprietaireTelephone', 'Propriétaire — téléphone'],
  ['proprietaire_telephone', 'Propriétaire — téléphone'],
  ['proprietaireEmail', 'Propriétaire — courriel'],
  ['proprietaire_email', 'Propriétaire — courriel'],
  ['proprietaireNif', 'Propriétaire — NIF / NIU'],
  ['proprietaire_nif', 'Propriétaire — NIF / NIU'],
  ['proprietaireCin', 'Propriétaire — CIN / NIN'],
  ['proprietaire_cin', 'Propriétaire — CIN / NIN'],
  ['proprietaireAdresse', 'Propriétaire — adresse'],
  ['proprietaire_adresse', 'Propriétaire — adresse'],
  ['adresse', 'Adresse / localisation'],
  ['superficieTerrainM2', 'Superficie terrain (m²)'],
  ['superficieAutoriseeConstruireM2', 'Superficie autorisée à construire (m²)'],
  ['surfacePrevueM2', 'Superficie projet (m²)'],
  ['clotureMl', 'Clôture (ml)'],
  ['niveauOuHauteur', 'Niveau / hauteur'],
  ['superficieBatimentDemolirM2', 'Surface à démolir (m²)'],
  ['parcelleSurfaceM2', 'Surface parcelle (m²)'],
  ['superficieConstruiteM2', 'Superficie construite (m²)'],
  ['niveauxNombre', 'Nombre de niveaux'],
  ['anneeConstruction', 'Année de construction'],
  ['logementOccupation', 'Occupation'],
  ['logementMur', 'Nature des murs'],
  ['toilettesNombre', 'Toilettes — nombre'],
  ['toilettesNature', 'Toilettes — nature'],
  ['cuisinesNombre', 'Cuisines — nombre'],
  ['cuisinesNature', 'Cuisines — nature'],
  ['etagesNombre', 'Étages — nombre'],
  ['appartementsNombre', 'Appartements — nombre'],
  ['chambresNombre', 'Chambres — nombre'],
  ['garagesNombre', 'Garages — nombre'],
  ['salonsNombre', 'Salons — nombre'],
  ['balconsNombre', 'Balcons — nombre'],
  ['plancherNature', 'Nature du plancher'],
  ['toitureNatures', 'Nature de la toiture'],
  ['surfaceM2', 'Surface (m²)'],
  ['immeubleUsage', 'Usage de l’immeuble'],
  ['constructionType', 'Type de construction'],
  ['constructionTypePrecise', 'Type de construction (précision)'],
  ['usageBatiment', 'Usage du bâtiment'],
  ['nomIngenieurArchitecte', 'Ingénieur ou architecte'],
  ['dureePermisConstruire', 'Durée du permis'],
  ['categoryTier', 'Échelon / catégorie'],
  ['marcheId', 'Réf. marché'],
  ['cimetiereId', 'Réf. cimetière'],
  ['linkedLogementEntityId', 'Propriété bâtie liée'],
  ['resultLogementEntityId', 'Fiche propriété issue du projet'],
  ['notes', 'Notes'],
]

export function buildRecensementDetailRows(raw: unknown): RecensementDetailRow[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  const rows: RecensementDetailRow[] = []
  const used = new Set<string>()

  for (const [key, label] of PRIORITY) {
    if (!(key in o)) continue
    used.add(key)
    push(rows, label, strField(key, o[key]))
  }

  const gps = o.gpsPoint ?? o.gps_point
  if (gps && typeof gps === 'object') {
    used.add('gpsPoint')
    used.add('gps_point')
    push(rows, 'Coordonnées GPS', formatGps(gps))
  }

  const photos = o.photos
  if (Array.isArray(photos)) {
    used.add('photos')
    push(rows, 'Photos', `${photos.length} fichier(s) joint(s)`)
  }

  const lignes = o.affichageLignes
  if (Array.isArray(lignes) && lignes.length) {
    used.add('affichageLignes')
    const text = lignes
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const x = item as Record<string, unknown>
        const q = x.quantity
        const qty = typeof q === 'number' && Number.isFinite(q) ? String(q) : str(q)
        const lab = str(x.label) || str(x.key)
        if (!lab && !qty) return ''
        return qty ? `${lab} × ${qty}` : lab
      })
      .filter(Boolean)
      .join(' · ')
    push(rows, 'Détail affichage (quantités)', text)
  }

  const restKeys = Object.keys(o).filter((k) => !used.has(k)).sort()
  for (const key of restKeys) {
    const v = o[key]
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    push(rows, LB[key] ?? key, strField(key, v))
  }

  return rows
}
