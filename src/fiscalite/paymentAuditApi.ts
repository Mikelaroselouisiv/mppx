import { apiFetch } from '../api'

export type FiscalPaymentAuditPayload = {
  obligationId: string
  paymentId: string
  moduleId: string
  entityId?: string | null
  entityLabel: string
  feeLabel: string
  currency?: string
  amountDue: number
  balanceBefore: number
  amount: number
  method: string
  reference?: string
  notes?: string
  paidAt: string
}

export async function postFiscalPaymentAudit(p: FiscalPaymentAuditPayload): Promise<void> {
  await apiFetch<unknown>('/recensement/fiscal-payments', {
    method: 'POST',
    body: JSON.stringify({
      obligationId: p.obligationId,
      paymentId: p.paymentId,
      moduleId: p.moduleId,
      entityId: p.entityId ?? null,
      entityLabel: p.entityLabel,
      feeLabel: p.feeLabel,
      currency: p.currency ?? 'HTG',
      amountDue: p.amountDue,
      balanceBefore: p.balanceBefore,
      amount: p.amount,
      method: p.method,
      reference: p.reference ?? '',
      notes: p.notes ?? '',
      paidAt: p.paidAt,
    }),
  })
}
