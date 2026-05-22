import { ApiError, apiFetch } from '../api'
import { normalizeObligationRow, type FiscalObligation } from './store'

export async function fetchFiscalObligations(): Promise<FiscalObligation[]> {
  const raw = await apiFetch<unknown>('/recensement/fiscal-obligations')
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeObligationRow).filter((x): x is FiscalObligation => x != null)
}

export async function putFiscalObligation(o: FiscalObligation): Promise<void> {
  await apiFetch<unknown>(`/recensement/fiscal-obligations/${encodeURIComponent(o.id)}`, {
    method: 'PUT',
    body: JSON.stringify(o),
  })
}

export async function deleteFiscalObligation(id: string): Promise<void> {
  try {
    await apiFetch<unknown>(`/recensement/fiscal-obligations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return
    throw e
  }
}
