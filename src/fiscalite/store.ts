/** Données fiscales : stockage local (cache) + synchronisation via `/recensement/fiscal-obligations`. */

/** Pas d’ORGANISATION : le recensement suffit, pas de taxes communales prévues. */
export type FiscalModuleId =
  | 'PROJET_CONSTRUCTION'
  | 'ENTREPRISE'
  | 'COMMERCANT'
  | 'LOGEMENT'
  | 'ECOLE'
  | 'EGLISE'
  | 'CIMETIERE'
  | 'JEUX_HASARD'
  | 'DOMAINE_ETAT'

export type FiscalPeriodicity = 'HEBDO' | 'MENSUEL' | 'ANNUEL' | 'PONCTUEL'

export type FiscalObligationStatus = 'DUE' | 'PARTIAL' | 'PAID'

export type FiscalPayment = {
  id: string
  paidAt: string
  amount: number
  method: string
  reference: string
  notes: string
  /** Agent ayant saisi le paiement (poste de travail + trace serveur). */
  recordedByUserId?: string | null
  recordedByDisplayName?: string | null
  recordedByEmail?: string | null
}

export type FiscalObligation = {
  id: string
  moduleId: FiscalModuleId
  /** Ex. ENTREPRISE, LOGEMENT, ou CONSTRUCTION_PROJECT */
  entityKind: string
  entityId: string | null
  entityLabel: string
  /** Propriétaire ou personne citée en tête du bordereau (ex. chantier). */
  taxpayerName: string | null
  /** Coordonnées du contribuable (bordereau / secrétariat). */
  taxpayerPhone: string | null
  taxpayerEmail: string | null
  /** N° dossier archive, permis, etc. (ex. projet de construction) — affiché sur le bordereau. */
  dossierRef: string | null
  feeLabel: string
  amountDue: number
  currency: string
  periodicity: FiscalPeriodicity
  /** Libellé de période libre (ex. 2026-05, semaine 18…) */
  periodRef: string
  dueDate: string
  notes: string
  payments: FiscalPayment[]
  status: FiscalObligationStatus
  createdAt: string
  updatedAt: string
}

export const FISCALITE_MODULES: Array<{ id: FiscalModuleId; label: string }> = [
  { id: 'PROJET_CONSTRUCTION', label: 'Projets de construction' },
  { id: 'CIMETIERE', label: 'Cimetières' },
  { id: 'ENTREPRISE', label: 'Entreprises' },
  { id: 'LOGEMENT', label: 'Propriétés bâties' },
  { id: 'JEUX_HASARD', label: 'Jeux de hasard' },
  { id: 'DOMAINE_ETAT', label: 'Domaine de l’État' },
  { id: 'ECOLE', label: 'Écoles' },
  { id: 'EGLISE', label: 'Églises' },
  { id: 'COMMERCANT', label: 'Petits commerçants (marchés)' },
]

/** Périodicité conseillée par module (modifiable à la saisie — suivi selon l’échéance). */
export const FISCAL_MODULE_DEFAULT_PERIODICITY: Record<FiscalModuleId, FiscalPeriodicity> = {
  PROJET_CONSTRUCTION: 'PONCTUEL',
  CIMETIERE: 'PONCTUEL',
  COMMERCANT: 'HEBDO',
  LOGEMENT: 'ANNUEL',
  ENTREPRISE: 'ANNUEL',
  ECOLE: 'MENSUEL',
  EGLISE: 'MENSUEL',
  JEUX_HASARD: 'ANNUEL',
  DOMAINE_ETAT: 'ANNUEL',
}

export function defaultPeriodicityForModule(id: FiscalModuleId): FiscalPeriodicity {
  return FISCAL_MODULE_DEFAULT_PERIODICITY[id]
}

/** Libellé de charge suggéré à la création (modifiable à la saisie). */
export function defaultFeeLabelForModule(id: FiscalModuleId): string {
  switch (id) {
    case 'CIMETIERE':
      return 'Frais de session'
    case 'ENTREPRISE':
      return 'Autorisation affichage'
    default:
      return ''
  }
}

const STORAGE_KEY = 'mairie-desktop.fiscalite.obligations.v1'

const ALLOWED_MODULE_IDS = new Set<string>(FISCALITE_MODULES.map((m) => m.id))

function nowIso() {
  return new Date().toISOString()
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function totalPaid(o: FiscalObligation): number {
  return o.payments.reduce((s, p) => (Number.isFinite(p.amount) ? s + p.amount : s), 0)
}

export function recomputeStatus(o: FiscalObligation): FiscalObligationStatus {
  const due = roundMoney(o.amountDue)
  const paid = roundMoney(totalPaid(o))
  if (due <= 0) return paid > 0 ? 'PAID' : 'DUE'
  if (paid >= due) return 'PAID'
  if (paid > 0) return 'PARTIAL'
  return 'DUE'
}

export function normalizeObligationRow(raw: unknown): FiscalObligation | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.moduleId === 'ORGANISATION') return null
  const moduleId = o.moduleId
  if (typeof moduleId !== 'string' || !ALLOWED_MODULE_IDS.has(moduleId)) return null
  const amountRaw = o.amountDue
  const amountDue =
    typeof amountRaw === 'number'
      ? amountRaw
      : typeof amountRaw === 'string'
        ? Number(amountRaw.replace(',', '.'))
        : Number(amountRaw)
  if (!Number.isFinite(amountDue) || amountDue < 0) return null
  const payRaw = o.payments
  const paymentsIn = Array.isArray(payRaw) ? payRaw : []
  const payments = paymentsIn
    .map((p) => {
      if (!p || typeof p !== 'object') return null
      const row = p as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id : null
      const paidAt = typeof row.paidAt === 'string' ? row.paidAt : null
      const amt =
        typeof row.amount === 'number'
          ? row.amount
          : typeof row.amount === 'string'
            ? Number(String(row.amount).replace(',', '.'))
            : NaN
      if (!id || !paidAt || !Number.isFinite(amt) || amt < 0) return null
      return {
        id,
        paidAt,
        amount: roundMoney(amt),
        method: typeof row.method === 'string' ? row.method : 'ESPECES',
        reference: typeof row.reference === 'string' ? row.reference : '',
        notes: typeof row.notes === 'string' ? row.notes : '',
        recordedByUserId:
          row.recordedByUserId == null || row.recordedByUserId === ''
            ? null
            : String(row.recordedByUserId),
        recordedByDisplayName:
          row.recordedByDisplayName == null ? null : String(row.recordedByDisplayName),
        recordedByEmail: row.recordedByEmail == null ? null : String(row.recordedByEmail),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  const dossierRaw = o.dossierRef
  const dossierRef =
    dossierRaw == null || dossierRaw === '' ? null : String(dossierRaw).trim() || null
  const taxRaw = o.taxpayerName
  const taxpayerName =
    taxRaw == null || taxRaw === '' ? null : String(taxRaw).trim() || null
  const tpRaw = o.taxpayerPhone
  const taxpayerPhone =
    tpRaw == null || tpRaw === '' ? null : String(tpRaw).trim() || null
  const teRaw = o.taxpayerEmail
  const taxpayerEmail =
    teRaw == null || teRaw === '' ? null : String(teRaw).trim() || null
  const entityIdRaw = o.entityId
  const entityId =
    entityIdRaw == null || entityIdRaw === '' ? null : String(entityIdRaw).trim() || null
  const entityLabel = typeof o.entityLabel === 'string' ? o.entityLabel : ''
  if (!entityLabel.trim()) return null
  const feeLabel = typeof o.feeLabel === 'string' ? o.feeLabel : ''
  if (!feeLabel.trim()) return null
  const entityKind = typeof o.entityKind === 'string' ? o.entityKind : String(moduleId)
  const currency = typeof o.currency === 'string' && o.currency.trim() ? o.currency.trim() : 'HTG'
  const allowedP = new Set(['HEBDO', 'MENSUEL', 'ANNUEL', 'PONCTUEL'])
  const periodicityRaw = o.periodicity
  const periodicityStr = typeof periodicityRaw === 'string' ? periodicityRaw : 'PONCTUEL'
  const periodicity = (allowedP.has(periodicityStr)
    ? periodicityStr
    : 'PONCTUEL') as FiscalPeriodicity
  const periodRef = typeof o.periodRef === 'string' ? o.periodRef : ''
  const dueDate = typeof o.dueDate === 'string' ? o.dueDate : ''
  const notes = typeof o.notes === 'string' ? o.notes : ''
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : nowIso()
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : nowIso()
  const base: FiscalObligation = {
    id: typeof o.id === 'string' ? o.id : '',
    moduleId: moduleId as FiscalModuleId,
    entityKind,
    entityId,
    entityLabel,
    taxpayerName,
    taxpayerPhone,
    taxpayerEmail,
    dossierRef,
    feeLabel,
    amountDue: roundMoney(amountDue),
    currency,
    periodicity,
    periodRef,
    dueDate,
    notes,
    payments,
    status: 'DUE',
    createdAt,
    updatedAt,
  }
  if (!base.id) return null
  return { ...base, status: recomputeStatus(base) }
}

export function loadObligations(): FiscalObligation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeObligationRow).filter((x): x is FiscalObligation => x != null)
  } catch {
    return []
  }
}

export function saveObligations(rows: FiscalObligation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function balanceDue(o: FiscalObligation): number {
  return Math.max(0, roundMoney(o.amountDue) - roundMoney(totalPaid(o)))
}

export function withStatus(o: FiscalObligation): FiscalObligation {
  return { ...o, status: recomputeStatus(o), updatedAt: nowIso() }
}

export const PERIODICITY_LABELS: Record<FiscalPeriodicity, string> = {
  HEBDO: 'Hebdomadaire',
  MENSUEL: 'Mensuel',
  ANNUEL: 'Annuel',
  PONCTUEL: 'Ponctuel',
}
