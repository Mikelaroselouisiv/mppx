import { ApiError } from '../api'
import { loadSettings } from '../storage'
import { normalizePaymentMethod } from './paymentMethods'
import { postFiscalPaymentAudit } from './paymentAuditApi'
import {
  balanceDue,
  newId,
  roundMoney,
  withStatus,
  type FiscalObligation,
  type FiscalPayment,
} from './store'

export type PayFormInput = {
  amount: string
  paidAt: string
  method: string
  reference: string
  notes: string
}

export type ApplyPaymentResult = { next: FiscalObligation[]; auditWarning: string | null }

/** Applique un paiement localement et tente la trace en base (utilisateur connecté). */
export async function applyPaymentWithAudit(
  all: FiscalObligation[],
  payTarget: FiscalObligation,
  payForm: PayFormInput,
): Promise<ApplyPaymentResult | { error: Error }> {
  const amount = roundMoney(Number(String(payForm.amount).replace(',', '.')))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: new Error('Montant de paiement invalide.') }
  }
  const paidAt = new Date(payForm.paidAt)
  if (Number.isNaN(paidAt.getTime())) {
    return { error: new Error('Date de paiement invalide.') }
  }
  const balanceBefore = balanceDue(payTarget)
  const user = loadSettings().user
  const payment: FiscalPayment = {
    id: newId(),
    paidAt: paidAt.toISOString(),
    amount,
    method: normalizePaymentMethod(payForm.method),
    reference: payForm.reference.trim(),
    notes: payForm.notes.trim(),
    recordedByUserId: user?.id?.trim() || null,
    recordedByDisplayName: user?.displayName ?? null,
    recordedByEmail: user?.email?.trim() || null,
  }
  const next = all.map((o) => {
    if (o.id !== payTarget.id) return o
    return withStatus({ ...o, payments: [...o.payments, payment] })
  })
  let auditWarning: string | null = null
  try {
    await postFiscalPaymentAudit({
      obligationId: payTarget.id,
      paymentId: payment.id,
      moduleId: payTarget.moduleId,
      entityId: payTarget.entityId,
      entityLabel: payTarget.entityLabel,
      feeLabel: payTarget.feeLabel,
      currency: payTarget.currency,
      amountDue: payTarget.amountDue,
      balanceBefore,
      amount,
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      paidAt: payment.paidAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const missingRoute =
      (e instanceof ApiError && (e.status === 404 || e.status === 405)) ||
      /cannot post|not found|\b404\b/i.test(msg)
    if (missingRoute) {
      auditWarning =
        'Paiement enregistré sur ce poste. Le serveur ne connaît pas encore POST /recensement/fiscal-payments — déployez la dernière API (contrôleur + migration fiscal_payment_records) puis réessayez pour la trace en base.'
    } else if (e instanceof ApiError && e.status === 401) {
      auditWarning =
        'Paiement enregistré localement. Trace serveur refusée (session expirée ou droits insuffisants) — reconnectez-vous.'
    } else {
      auditWarning = `Paiement enregistré localement. Trace serveur : ${msg}`
    }
  }
  return { next, auditWarning }
}
