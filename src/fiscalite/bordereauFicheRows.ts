import type { FiscalModuleId } from './store'
import { buildRecensementDetailRows } from './recensementDetailRows'

export type BordereauFicheField = {
  label: string
  value: string
  /** 1 = colonne normale, 3 = ligne pleine largeur (adresse, désignation…) */
  span: 1 | 3
}

/** Champs exclus du bordereau (technique, médias, notes internes). */
const EXCLUDED_LABELS = new Set([
  'Identifiant technique',
  'Type de fiche',
  'Échelon / catégorie',
  'Notes',
  'Coordonnées GPS',
  'Photos',
  'Créé le',
  'Mis à jour le',
  'Réf. marché',
  'Réf. cimetière',
  'Propriété bâtie liée',
  'Fiche propriété issue du projet',
  'Type d’affichage',
  'Lignes d’affichage',
  'Détail affichage (quantités)',
  'Propriétaire — notes',
])

const EXCLUDED_LABEL_PATTERNS = [/^[a-z][a-zA-Z]+$/, /^Réf\. recensement/i]

/** Libellés courts pour le PDF bordereau. */
const FRIENDLY_LABEL: Record<string, string> = {
  'N° dossier': 'N° dossier',
  Désignation: 'Désignation',
  Dénomination: 'Dénomination',
  'Catégorie (domaine)': 'Catégorie',
  Statut: 'Statut',
  'Téléphone (chantier)': 'Téléphone',
  Courriel: 'Courriel',
  'Adresse / localisation': 'Adresse',
  'Propriétaire — nom ou institution': 'Nom propriétaire',
  'Propriétaire — prénom': 'Prénom',
  'Propriétaire — téléphone': 'Téléphone propriétaire',
  'Propriétaire — courriel': 'Courriel propriétaire',
  'Propriétaire — NIF / NIU': 'NIF / NIU',
  'Propriétaire — CIN / NIN': 'CIN / NIN',
  'Propriétaire — adresse': 'Adresse propriétaire',
  'Superficie terrain (m²)': 'Terrain (m²)',
  'Superficie construite (m²)': 'Construit (m²)',
  'Surface parcelle (m²)': 'Parcelle (m²)',
  'Surface (m²)': 'Surface (m²)',
  'Année de construction': 'Année construction',
  'Nature des murs': 'Murs',
  'Toilettes — nombre': 'Toilettes',
  'Toilettes — nature': 'Nature toilettes',
  'Cuisines — nombre': 'Cuisines',
  'Cuisines — nature': 'Nature cuisines',
  'Étages — nombre': 'Étages',
  'Appartements — nombre': 'Appartements',
  'Chambres — nombre': 'Chambres',
  'Garages — nombre': 'Garages',
  'Salons — nombre': 'Salons',
  'Balcons — nombre': 'Balcons',
  'Nature du plancher': 'Plancher',
  'Nature de la toiture': 'Toiture',
  'Usage de l’immeuble': 'Usage immeuble',
  'Usage du bâtiment': 'Usage bâtiment',
  'Nombre de niveaux': 'Niveaux',
  'Type de construction': 'Construction',
  'Type de construction (précision)': 'Construction (précision)',
}

const FULL_WIDTH_LABELS = new Set([
  'Désignation',
  'Dénomination',
  'Adresse',
  'Adresse propriétaire',
  'Usage immeuble',
  'Usage bâtiment',
])

function friendlyLabel(rawLabel: string): string {
  return FRIENDLY_LABEL[rawLabel] ?? rawLabel.replace(/^Propriétaire — /, '').replace(/ — /g, ' ')
}

const EXCLUDED_RAW_LABELS = new Set([
  'petitCommercant',
  'isActive',
  'marcheId',
  'cimetiereId',
])

function shouldExclude(label: string, value: string): boolean {
  if (EXCLUDED_LABELS.has(label)) return true
  if (EXCLUDED_RAW_LABELS.has(label)) return true
  if (/^Non$/i.test(value) && /^[a-z][a-zA-Z0-9]*$/.test(label)) return true
  for (const p of EXCLUDED_LABEL_PATTERNS) {
    if (p.test(label)) return true
  }
  return false
}

/** Ordre d’affichage préféré sur le bordereau (libellés amicaux). */
const PREFERRED_ORDER: string[] = [
  'N° dossier',
  'Désignation',
  'Dénomination',
  'Catégorie',
  'Nom propriétaire',
  'Prénom',
  'Téléphone propriétaire',
  'Courriel propriétaire',
  'NIF / NIU',
  'CIN / NIN',
  'Adresse propriétaire',
  'Adresse',
  'Téléphone',
  'Courriel',
  'Année construction',
  'Occupation',
  'Murs',
  'Plancher',
  'Toiture',
  'Surface (m²)',
  'Terrain (m²)',
  'Construit (m²)',
  'Parcelle (m²)',
  'Niveaux',
  'Étages',
  'Appartements',
  'Chambres',
  'Salons',
  'Cuisines',
  'Nature cuisines',
  'Toilettes',
  'Nature toilettes',
  'Garages',
  'Balcons',
  'Usage immeuble',
  'Usage bâtiment',
  'Construction',
  'Construction (précision)',
]

function sortFields(a: BordereauFicheField, b: BordereauFicheField): number {
  const ia = PREFERRED_ORDER.indexOf(a.label)
  const ib = PREFERRED_ORDER.indexOf(b.label)
  if (ia >= 0 && ib >= 0) return ia - ib
  if (ia >= 0) return -1
  if (ib >= 0) return 1
  return a.label.localeCompare(b.label, 'fr')
}

export function buildBordereauFicheRows(
  raw: unknown,
  _moduleId: FiscalModuleId,
): BordereauFicheField[] {
  const seen = new Set<string>()
  const out: BordereauFicheField[] = []

  for (const row of buildRecensementDetailRows(raw)) {
    const label = friendlyLabel(row.label)
    const value = row.value.trim()
    if (!value || shouldExclude(row.label, value) || shouldExclude(label, value)) continue
    const dedupeKey = `${label}::${value}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({
      label,
      value,
      span: FULL_WIDTH_LABELS.has(label) ? 3 : 1,
    })
  }

  return out.sort(sortFields)
}
