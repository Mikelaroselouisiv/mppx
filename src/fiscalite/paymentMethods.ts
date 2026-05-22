/** Moyens de paiement — valeurs stockées en base (local). */

export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'ESPECES', label: 'Espèces' },
  { value: 'CHEQUE', label: 'Chèque' },
  { value: 'VIREMENT', label: 'Virement bancaire' },
  { value: 'CARTE', label: 'Carte bancaire' },
  { value: 'MOBILE_MONEY', label: 'Transfert mobile / wallet' },
  { value: 'AUTRE', label: 'Autre' },
]

const LEGACY_TO_CODE: Record<string, string> = {
  Espèces: 'ESPECES',
  Chèque: 'CHEQUE',
  Virement: 'VIREMENT',
  Autre: 'AUTRE',
}

export function normalizePaymentMethod(raw: string): string {
  const t = String(raw ?? '').trim()
  if (!t) return 'ESPECES'
  if (LEGACY_TO_CODE[t]) return LEGACY_TO_CODE[t]
  const upper = t.toUpperCase()
  if (PAYMENT_METHOD_OPTIONS.some((o) => o.value === upper)) return upper
  return t
}

export function labelPaymentMethod(stored: string): string {
  const code = normalizePaymentMethod(stored)
  const hit = PAYMENT_METHOD_OPTIONS.find((o) => o.value === code)
  return hit ? hit.label : stored
}

/** Libellé du champ « référence » selon le mode (pour l’UI). */
export function paymentReferenceFieldLabel(method: string): string {
  const code = normalizePaymentMethod(method)
  switch (code) {
    case 'ESPECES':
      return 'Réf. reçu / quittance (optionnel)'
    case 'CHEQUE':
      return 'N° de chèque / ordre sur'
    case 'VIREMENT':
      return 'Réf. virement / libellé banque'
    case 'CARTE':
      return 'N° d’autorisation / trace terminal'
    case 'MOBILE_MONEY':
      return 'Réf. transaction / téléphone'
    case 'AUTRE':
      return 'Référence / détail'
    default:
      return 'Référence / reçu'
  }
}

export function paymentReferencePlaceholder(method: string): string {
  const code = normalizePaymentMethod(method)
  switch (code) {
    case 'ESPECES':
      return 'ex. reçu n° …'
    case 'CHEQUE':
      return 'ex. 000123 — Banque …'
    case 'VIREMENT':
      return 'ex. VIR 2026-…'
    case 'CARTE':
      return 'ex. AUTH …'
    case 'MOBILE_MONEY':
      return 'ex. ID MonCash / transfert'
    default:
      return ''
  }
}
