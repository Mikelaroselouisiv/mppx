import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from './api'
import { proprietaireFromProjectPayload } from './fiscalite/constructionProjectFromApi'
import {
  PAYMENT_METHOD_OPTIONS,
  paymentReferenceFieldLabel,
} from './fiscalite/paymentMethods'
import { fetchFiscalObligations, putFiscalObligation } from './fiscalite/obligationsApi'
import { applyPaymentWithAudit } from './fiscalite/recordPayment'
import { ListToolbarCount } from './components/ListToolbarCount'
import { RecensementEntityCard } from './components/RecensementEntityCard'
import { PhotoGallery } from './components/PhotoGallery'
import { entityCardFromFiscalRef } from './fiscalite/entityCardFields'
import { photoKeysFromRaw } from './fiscalite/photoUtils'
import { sortByCreatedAtDesc } from './fiscalite/sortByCreatedAt'
import { RecensementDetailSheet } from './fiscalite/RecensementDetailSheet'
import { useRecensementDetail } from './fiscalite/useRecensementDetail'
import {
  ORPHAN_ENTITY_ID,
  normalizeEntities,
  normalizeProjects,
  type FiscalRefEntity,
} from './fiscalite/refEntities'
import {
  FISCALITE_MODULES,
  type FiscalModuleId,
  type FiscalObligation,
  type FiscalObligationStatus,
  type FiscalPeriodicity,
  loadObligations,
  saveObligations,
  balanceDue,
  roundMoney,
  totalPaid,
} from './fiscalite/store'

function labelFiscalObligationStatus(s: FiscalObligationStatus): string {
  switch (s) {
    case 'DUE':
      return 'À payer'
    case 'PARTIAL':
      return 'Partiel'
    case 'PAID':
      return 'Soldé'
  }
}

function ErrorBox({ err }: { err: unknown }) {
  if (!err) return null
  return (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Erreur</div>
      <div className="mono">{err instanceof Error ? err.message : String(err)}</div>
    </div>
  )
}

function labelPeriodicityShort(p: FiscalPeriodicity): string {
  switch (p) {
    case 'HEBDO':
      return 'Hebdo.'
    case 'MENSUEL':
      return 'Mensuel'
    case 'ANNUEL':
      return 'Annuel'
    case 'PONCTUEL':
      return 'Ponctuel'
  }
}

function aggregateBalance(obs: FiscalObligation[]): number {
  return roundMoney(obs.reduce((s, o) => s + balanceDue(o), 0))
}

function hasDebt(obs: FiscalObligation[]): boolean {
  return obs.some((o) => balanceDue(o) > 0.001)
}

export function RecouvrementPage({ canWriteRecensement = false }: { canWriteRecensement?: boolean }) {
  const [moduleId, setModuleId] = useState<FiscalModuleId>('PROJET_CONSTRUCTION')
  const [all, setAll] = useState<FiscalObligation[]>(() => loadObligations())
  const [q, setQ] = useState('')
  const [err, setErr] = useState<unknown>(null)

  const [refBusy, setRefBusy] = useState(false)
  const [refEntities, setRefEntities] = useState<FiscalRefEntity[]>([])

  const [entityPanel, setEntityPanel] = useState<FiscalRefEntity | null>(null)
  const [liveProp, setLiveProp] = useState<ReturnType<typeof proprietaireFromProjectPayload> | null>(null)

  const [payOpen, setPayOpen] = useState(false)
  const [payTarget, setPayTarget] = useState<FiscalObligation | null>(null)
  const [payForm, setPayForm] = useState({
    amount: '',
    paidAt: toLocalDatetimeValue(new Date()),
    method: 'ESPECES',
    reference: '',
    notes: '',
  })

  const persist = useCallback((next: FiscalObligation[]) => {
    setAll(next)
    saveObligations(next)
  }, [])

  const obligationsForModule = useMemo(
    () => all.filter((o) => o.moduleId === moduleId),
    [all, moduleId],
  )

  const orphanDebts = useMemo(
    () => obligationsForModule.filter((o) => !o.entityId && balanceDue(o) > 0.001),
    [obligationsForModule],
  )

  const orphanSynthetic = useMemo((): FiscalRefEntity | null => {
    if (!orphanDebts.length) return null
    return {
      id: ORPHAN_ENTITY_ID,
      denomination: 'Charges non liées au recensement',
      taxpayerName: null,
    }
  }, [orphanDebts.length])

  const entityCardsAll = useMemo(() => {
    const out: FiscalRefEntity[] = []
    if (orphanSynthetic) out.push(orphanSynthetic)
    for (const e of refEntities) {
      const obs = obligationsForModule.filter((o) => o.entityId === e.id)
      if (hasDebt(obs)) out.push(e)
    }
    const sorted = sortByCreatedAtDesc(out.filter((e) => e.id !== ORPHAN_ENTITY_ID))
    const orphan = out.find((e) => e.id === ORPHAN_ENTITY_ID)
    return orphan ? [orphan, ...sorted] : sorted
  }, [refEntities, obligationsForModule, orphanSynthetic])

  const entityCardsFiltered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return entityCardsAll
    const out: FiscalRefEntity[] = []
    if (orphanSynthetic) {
      const matchOrphan =
        s.includes('non') ||
        s.includes('lié') ||
        orphanDebts.some((o) =>
          `${o.feeLabel} ${o.entityLabel} ${o.taxpayerName ?? ''} ${o.dossierRef ?? ''}`
            .toLowerCase()
            .includes(s),
        )
      if (matchOrphan) out.push(orphanSynthetic)
    }
    for (const e of refEntities) {
      const obs = obligationsForModule.filter((o) => o.entityId === e.id)
      if (!hasDebt(obs)) continue
      if ((e as any).numeroDossier && String((e as any).numeroDossier).toLowerCase().includes(s)) {
        out.push(e)
        continue
      }
      if (e.denomination.toLowerCase().includes(s)) {
        out.push(e)
        continue
      }
      if (e.taxpayerName && e.taxpayerName.toLowerCase().includes(s)) {
        out.push(e)
        continue
      }
      const hit = obs.some((o) =>
        `${o.feeLabel} ${o.periodRef} ${o.notes} ${o.dossierRef ?? ''} ${o.entityLabel} ${o.taxpayerName ?? ''} ${o.taxpayerPhone ?? ''} ${o.taxpayerEmail ?? ''}`
          .toLowerCase()
          .includes(s),
      )
      if (hit) out.push(e)
    }
    const sorted = sortByCreatedAtDesc(out.filter((e) => e.id !== ORPHAN_ENTITY_ID))
    const orphan = out.find((e) => e.id === ORPHAN_ENTITY_ID)
    return orphan ? [orphan, ...sorted] : sorted
  }, [entityCardsAll, refEntities, obligationsForModule, q, orphanSynthetic, orphanDebts])

  const panelObligations = useMemo(() => {
    if (!entityPanel) return []
    if (entityPanel.id === ORPHAN_ENTITY_ID) {
      return orphanDebts.slice().sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))
    }
    return obligationsForModule
      .filter((o) => o.entityId === entityPanel.id && balanceDue(o) > 0.001)
      .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))
  }, [entityPanel, obligationsForModule, orphanDebts])

  const loadRefs = async (mod: FiscalModuleId) => {
    setRefBusy(true)
    setErr(null)
    try {
      if (mod === 'PROJET_CONSTRUCTION') {
        const r = await apiFetch<any>('/recensement/construction-projects')
        setRefEntities(sortByCreatedAtDesc(normalizeProjects(r)))
      } else if (mod === 'DOMAINE_ETAT') {
        const r = await apiFetch<any>('/recensement/domaine-etat-biens')
        setRefEntities(sortByCreatedAtDesc(normalizeEntities(Array.isArray(r) ? r : [])))
      } else {
        const r = await apiFetch<any>(`/recensement/entities?kind=${encodeURIComponent(mod)}`)
        setRefEntities(sortByCreatedAtDesc(normalizeEntities(r)))
      }
    } catch (e) {
      setRefEntities([])
      setErr(e)
    } finally {
      setRefBusy(false)
    }
  }

  useEffect(() => {
    void loadRefs(moduleId)
  }, [moduleId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchFiscalObligations()
        if (cancelled) return
        saveObligations(rows)
        setAll(rows)
      } catch (e) {
        if (cancelled) return
        setErr(e)
        setAll(loadObligations())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setEntityPanel(null)
  }, [moduleId])

  useEffect(() => {
    setEntityPanel((prev) => {
      if (!prev) return prev
      if (prev.id === ORPHAN_ENTITY_ID) return orphanSynthetic ? prev : null
      const still = refEntities.some((e) => e.id === prev.id)
      return still ? prev : null
    })
  }, [refEntities, orphanSynthetic])

  useEffect(() => {
    if (!entityPanel || entityPanel.id === ORPHAN_ENTITY_ID || moduleId !== 'PROJET_CONSTRUCTION') {
      setLiveProp(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const raw = await apiFetch<unknown>(
          `/recensement/construction-projects/${encodeURIComponent(entityPanel.id)}`,
        )
        if (!cancelled) setLiveProp(proprietaireFromProjectPayload(raw))
      } catch {
        if (!cancelled) setLiveProp(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entityPanel, moduleId])

  const openPay = (o: FiscalObligation) => {
    setPayTarget(o)
    const bal = balanceDue(o)
    setPayForm({
      amount: bal > 0 ? String(bal) : '',
      paidAt: toLocalDatetimeValue(new Date()),
      method: 'ESPECES',
      reference: '',
      notes: '',
    })
    setPayOpen(true)
  }

  const savePayment = async () => {
    if (!payTarget) return
    setErr(null)
    const r = await applyPaymentWithAudit(all, payTarget, payForm)
    if ('error' in r) {
      setErr(r.error)
      return
    }
    persist(r.next)
    let syncMsg: string | null = null
    const updated = r.next.find((x) => x.id === payTarget.id)
    if (updated) {
      try {
        await putFiscalObligation(updated)
      } catch (e) {
        syncMsg = e instanceof Error ? e.message : String(e)
      }
    }
    const parts = [r.auditWarning, syncMsg].filter(Boolean) as string[]
    if (parts.length) setErr(new Error(parts.join(' ')))
    setPayOpen(false)
    setPayTarget(null)
  }

  const mod = FISCALITE_MODULES.find((m) => m.id === moduleId)!

  const panelDetailQuery = useRecensementDetail(
    moduleId,
    entityPanel && entityPanel.id !== ORPHAN_ENTITY_ID ? entityPanel.id : null,
    !!entityPanel && entityPanel.id !== ORPHAN_ENTITY_ID,
  )

  const refHit =
    entityPanel && entityPanel.id !== ORPHAN_ENTITY_ID
      ? refEntities.find((r) => r.id === entityPanel.id)
      : null

  const firstDebt = panelObligations[0]
  const displayName =
    liveProp?.displayName?.trim() ||
    firstDebt?.taxpayerName?.trim() ||
    (entityPanel && entityPanel.id !== ORPHAN_ENTITY_ID
      ? refHit?.taxpayerName?.trim() || entityPanel.denomination
      : orphanDebts.length
        ? 'Plusieurs charges sans lien — voir liste'
        : '—')
  const displayPhone =
    liveProp?.phone?.trim() || firstDebt?.taxpayerPhone?.trim() || refHit?.taxpayerPhone?.trim() || ''
  const displayEmail =
    liveProp?.email?.trim() || firstDebt?.taxpayerEmail?.trim() || refHit?.taxpayerEmail?.trim() || ''

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        className="row"
        style={{ justifyContent: 'space-between', padding: 12, borderBottom: '1px solid rgba(0,0,0,0.08)' }}
      >
        <div>
          <div style={{ fontWeight: 900 }}>Recouvrement</div>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <ListToolbarCount
            total={entityCardsAll.length}
            filtered={q.trim() ? entityCardsFiltered.length : undefined}
            busy={refBusy}
            singular="fiche avec dette"
            plural="fiches avec dette"
          />
          <div className="field" style={{ minWidth: 260 }}>
            <div className="label">Recherche</div>
            <input
              className="input mono"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
            />
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void (async () => {
                setErr(null)
                try {
                  const rows = await fetchFiscalObligations()
                  saveObligations(rows)
                  setAll(rows)
                } catch (e) {
                  setErr(e)
                  setAll(loadObligations())
                }
              })()
            }}
          >
            Recharger depuis le serveur
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 520 }}>
        <aside style={{ borderRight: '1px solid rgba(0,0,0,0.08)', padding: 12, background: 'rgba(255,255,255,0.5)' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {FISCALITE_MODULES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`btn ${moduleId === m.id ? 'primary' : ''}`}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setModuleId(m.id)}
              >
                <span style={{ fontWeight: 800 }}>{m.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main style={{ padding: 12 }}>
          {err ? (
            <div style={{ marginBottom: 12 }}>
              <ErrorBox err={err} />
            </div>
          ) : null}

          <div className="entity-grid">
            {entityCardsFiltered.map((e) => {
              const obs =
                e.id === ORPHAN_ENTITY_ID
                  ? orphanDebts
                  : obligationsForModule.filter((o) => o.entityId === e.id)
              const bal = aggregateBalance(obs)
              const card = entityCardFromFiscalRef(e)
              return (
                <RecensementEntityCard
                  key={e.id}
                  display={card}
                  title={e.denomination}
                  onClick={() => setEntityPanel(e)}
                  meta={
                    <>
                      <span className="pill pill--compact mono pill--neutral">
                        {obs.filter((o) => balanceDue(o) > 0).length} dette
                        {obs.filter((o) => balanceDue(o) > 0).length === 1 ? '' : 's'}
                      </span>
                      <span className="pill pill--compact mono pill--neutral">
                        Solde {bal.toLocaleString('fr-HT')} HTG
                      </span>
                    </>
                  }
                />
              )
            })}
            {!entityCardsFiltered.length ? (
              <div className="mono" style={{ opacity: 0.75 }}>
                {refBusy ? '…' : 'Aucune dette enregistrée pour ce module.'}
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {entityPanel ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ width: 920, maxWidth: '96vw' }}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 900 }}>Fiche recouvrement</div>
                <div className="mono" style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>
                  {(entityPanel as any).numeroDossier
                    ? `${(entityPanel as any).numeroDossier} · ${entityPanel.denomination}`
                    : entityPanel.denomination}{' '}
                  · {mod.label}
                </div>
              </div>
              <button type="button" className="btn" onClick={() => setEntityPanel(null)}>
                Fermer
              </button>
            </div>
            <div className="modal-body">
              {entityPanel.id !== ORPHAN_ENTITY_ID ? (
                <>
                  <div className="entity-view-photos" style={{ marginBottom: 14 }}>
                    <div className="label" style={{ marginBottom: 8 }}>
                      Photos
                    </div>
                    <PhotoGallery
                      photoKeys={
                        panelDetailQuery.data
                          ? photoKeysFromRaw((panelDetailQuery.data as any)?.photos)
                          : entityPanel.coverPhotoKey
                            ? [entityPanel.coverPhotoKey]
                            : []
                      }
                    />
                  </div>
                  <RecensementDetailSheet
                    busy={panelDetailQuery.busy}
                    err={panelDetailQuery.err}
                    data={panelDetailQuery.data}
                    style={{ marginBottom: 14 }}
                  />
                </>
              ) : (
                <div
                  className="card"
                  style={{ marginBottom: 14, padding: 12, background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Contribuable</div>
                  <div style={{ fontSize: 15 }}>{displayName}</div>
                  {displayPhone ? (
                    <div className="mono" style={{ marginTop: 6, fontSize: 13 }}>
                      Téléphone : {displayPhone}
                    </div>
                  ) : null}
                  {displayEmail ? (
                    <div className="mono" style={{ marginTop: 4, fontSize: 13 }}>
                      Courriel : {displayEmail}
                    </div>
                  ) : null}
                </div>
              )}

              <div style={{ fontWeight: 800, marginBottom: 10 }}>Dettes à recouvrer</div>
              {!panelObligations.length ? (
                <div className="mono" style={{ opacity: 0.8 }}>Plus de dette sur cette fiche.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {panelObligations.map((o) => (
                    <div key={o.id} className="user-card user-card--static" style={{ boxShadow: 'none' }}>
                      <div className="user-card-body">
                        <div className="user-card-fee">{o.feeLabel}</div>
                        {o.dossierRef ? (
                          <div className="user-card-sub mono" style={{ fontWeight: 600 }}>
                            N° dossier : {o.dossierRef}
                          </div>
                        ) : null}
                        <div className="user-card-meta">
                          <span className="pill pill--compact mono" data-fiscal={o.status}>
                            {labelFiscalObligationStatus(o.status)}
                          </span>
                          <span className="pill pill--compact mono pill--neutral">
                            {labelPeriodicityShort(o.periodicity)}
                          </span>
                          <span className="pill pill--compact mono pill--neutral">
                            Dû {o.amountDue.toLocaleString('fr-HT')} {o.currency}
                          </span>
                        </div>
                        <div className="user-card-sub mono">
                          Solde : {balanceDue(o).toLocaleString('fr-HT')} {o.currency} · Payé :{' '}
                          {totalPaid(o).toLocaleString('fr-HT')} {o.currency}
                        </div>
                        <div className="user-card-actions" style={{ borderTop: 'none', paddingTop: 8, marginTop: 0 }}>
                          <button type="button" className="btn primary" onClick={() => openPay(o)}>
                            Enregistrer un paiement
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {payOpen && payTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ width: 520, maxWidth: '96vw' }}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>Paiement — trace en base</div>
              <button type="button" className="btn" onClick={() => setPayOpen(false)}>
                Fermer
              </button>
            </div>
            <div className="modal-body">
              <div className="mono" style={{ opacity: 0.85, marginBottom: 12 }}>
                {payTarget.entityLabel} — {payTarget.feeLabel}
                <br />
                Solde : {balanceDue(payTarget).toLocaleString('fr-HT')} {payTarget.currency}
              </div>
              <div className="grid">
                <div className="field">
                  <div className="label">Montant</div>
                  <input
                    className="input mono"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <div className="label">Date / heure</div>
                  <input
                    type="datetime-local"
                    className="input mono"
                    value={payForm.paidAt}
                    onChange={(e) => setPayForm((f) => ({ ...f, paidAt: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <div className="label">Moyen de paiement</div>
                  <select
                    className="input"
                    value={payForm.method}
                    onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                  >
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="label">{paymentReferenceFieldLabel(payForm.method)}</div>
                  <input
                    className="input mono"
                    value={payForm.reference}
                    onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Notes</div>
                  <textarea
                    className="input"
                    rows={2}
                    value={payForm.notes}
                    onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setPayOpen(false)}>
                Annuler
              </button>
              <button type="button" className="btn primary" onClick={() => void savePayment()}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function toLocalDatetimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
