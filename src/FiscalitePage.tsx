import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from './api'
import { downloadBordereauPdf } from './fiscalite/bordereau'
import {
  PAYMENT_METHOD_OPTIONS,
  paymentReferenceFieldLabel,
} from './fiscalite/paymentMethods'
import { deleteFiscalObligation, fetchFiscalObligations, putFiscalObligation } from './fiscalite/obligationsApi'
import { proprietaireFromProjectPayload } from './fiscalite/constructionProjectFromApi'
import {
  defaultEntityLabelFromRef,
  normalizeEntities,
  normalizeProjects,
  type FiscalRefEntity,
} from './fiscalite/refEntities'
import { ListToolbarCount } from './components/ListToolbarCount'
import { RecensementEntityCard } from './components/RecensementEntityCard'
import { PhotoGallery } from './components/PhotoGallery'
import { entityCardFromFiscalRef } from './fiscalite/entityCardFields'
import { photoKeysFromRaw } from './fiscalite/photoUtils'
import { sortByCreatedAtDesc } from './fiscalite/sortByCreatedAt'
import { RecensementDetailSheet } from './fiscalite/RecensementDetailSheet'
import {
  FISCALITE_MODULES,
  type FiscalModuleId,
  type FiscalObligation,
  type FiscalObligationStatus,
  type FiscalPeriodicity,
  loadObligations,
  newId,
  roundMoney,
  saveObligations,
  balanceDue,
  totalPaid,
  withStatus,
  defaultPeriodicityForModule,
  defaultFeeLabelForModule,
} from './fiscalite/store'
import { useRecensementDetail } from './fiscalite/useRecensementDetail'

function ErrorBox({ err }: { err: unknown }) {
  if (!err) return null
  return (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Erreur</div>
      <div className="mono">{err instanceof Error ? err.message : String(err)}</div>
    </div>
  )
}

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

function worstFiscalStatus(obs: FiscalObligation[]): FiscalObligationStatus | null {
  if (!obs.length) return null
  const bal = aggregateBalance(obs)
  if (bal <= 0) return 'PAID'
  if (obs.some((o) => o.status === 'PARTIAL')) return 'PARTIAL'
  return 'DUE'
}

export function FiscalitePage({ canWriteRecensement = false }: { canWriteRecensement?: boolean }) {
  const [moduleId, setModuleId] = useState<FiscalModuleId>('PROJET_CONSTRUCTION')
  const [all, setAll] = useState<FiscalObligation[]>(() => loadObligations())
  const [q, setQ] = useState('')
  const [err, setErr] = useState<unknown>(null)

  const [saveBusy, setSaveBusy] = useState(false)
  const [overrideRecensementFields, setOverrideRecensementFields] = useState(false)

  const [refBusy, setRefBusy] = useState(false)
  const [refEntities, setRefEntities] = useState<FiscalRefEntity[]>([])

  const [entityPanel, setEntityPanel] = useState<FiscalRefEntity | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selected, setSelected] = useState<FiscalObligation | null>(null)
  const [form, setForm] = useState<any>(() => emptyForm('PROJET_CONSTRUCTION'))

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

  const entityCardsFiltered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = sortByCreatedAtDesc(refEntities)
    const filtered = base.filter((e) => {
      if (!s) return true
      if (e.denomination.toLowerCase().includes(s)) return true
      if ((e as any).numeroDossier && String((e as any).numeroDossier).toLowerCase().includes(s)) return true
      if (e.taxpayerName && e.taxpayerName.toLowerCase().includes(s)) return true
      const obs = obligationsForModule.filter((o) => o.entityId === e.id)
      return obs.some((o) =>
        `${o.feeLabel} ${o.periodRef} ${o.notes} ${o.dossierRef ?? ''} ${o.entityLabel} ${o.taxpayerName ?? ''} ${o.taxpayerPhone ?? ''} ${o.taxpayerEmail ?? ''}`
          .toLowerCase()
          .includes(s),
      )
    })
    return filtered
  }, [refEntities, obligationsForModule, q])

  const panelObligations = useMemo(() => {
    if (!entityPanel) return []
    return obligationsForModule
      .filter((o) => o.entityId === entityPanel.id)
      .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))
  }, [entityPanel, obligationsForModule])

  const mergeRefIntoForm = useCallback((hit: FiscalRefEntity | undefined, prev: any) => {
    if (!hit) {
      return {
        ...prev,
        entityId: '',
        entityKind:
          moduleId === 'PROJET_CONSTRUCTION'
            ? 'CONSTRUCTION_PROJECT'
            : moduleId === 'DOMAINE_ETAT'
              ? 'DOMAINE_ETAT'
              : moduleId,
      }
    }
    return {
      ...prev,
      entityId: hit.id,
      entityLabel: defaultEntityLabelFromRef(moduleId, hit),
      taxpayerName: hit.taxpayerName ?? '',
      taxpayerPhone: hit.taxpayerPhone ?? '',
      taxpayerEmail: hit.taxpayerEmail ?? '',
      dossierRef: hit.numeroDossier ?? '',
      feeLabel: String(prev.feeLabel ?? '').trim()
        ? prev.feeLabel
        : defaultFeeLabelForModule(moduleId),
      entityKind:
        moduleId === 'PROJET_CONSTRUCTION'
          ? 'CONSTRUCTION_PROJECT'
          : moduleId === 'DOMAINE_ETAT'
            ? 'DOMAINE_ETAT'
            : moduleId,
    }
  }, [moduleId])

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
      const still = refEntities.some((e) => e.id === prev.id)
      return still ? prev : null
    })
  }, [refEntities])

  const openCreate = () => {
    setSelected(null)
    setModalMode('create')
    setOverrideRecensementFields(false)
    setForm(emptyForm(moduleId))
    setModalOpen(true)
  }

  const openCreateForEntity = (e: FiscalRefEntity) => {
    setSelected(null)
    setModalMode('create')
    setOverrideRecensementFields(false)
    setForm(mergeRefIntoForm(e, emptyForm(moduleId)))
    setModalOpen(true)
  }

  const openEdit = (o: FiscalObligation) => {
    setSelected(o)
    setModalMode('edit')
    setOverrideRecensementFields(false)
    setForm({
      entityId: o.entityId ?? '',
      entityLabel: o.entityLabel,
      taxpayerName: o.taxpayerName ?? '',
      taxpayerPhone: o.taxpayerPhone ?? '',
      taxpayerEmail: o.taxpayerEmail ?? '',
      entityKind: o.entityKind,
      dossierRef: o.dossierRef ?? '',
      feeLabel: o.feeLabel,
      amountDue: String(o.amountDue),
      currency: o.currency || 'HTG',
      periodicity: o.periodicity,
      periodRef: o.periodRef,
      dueDate: o.dueDate ? o.dueDate.slice(0, 10) : '',
      notes: o.notes ?? '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelected(null)
    setOverrideRecensementFields(false)
  }

  const normDossier = (v: unknown) => {
    const t = String(v ?? '').trim()
    return t.length ? t : null
  }

  const saveObligation = async () => {
    setErr(null)
    const feeLabel = String(form.feeLabel ?? '').trim()
    if (!feeLabel) {
      setErr(new Error('Libellé de la redevance requis.'))
      return
    }

    const entityIdRaw = String(form.entityId ?? '').trim()
    const entityId = entityIdRaw || null
    const refHit = entityId ? refEntities.find((r) => r.id === entityId) : undefined

    let entityLabel = String(form.entityLabel ?? '').trim()
    if (!entityLabel && refHit) {
      entityLabel = defaultEntityLabelFromRef(moduleId, refHit)
    }
    if (!entityLabel) {
      setErr(new Error('Liez une fiche du recensement ou saisissez une référence libre.'))
      return
    }

    const amountDue = roundMoney(Number(String(form.amountDue ?? '').replace(',', '.')))
    if (!Number.isFinite(amountDue) || amountDue < 0) {
      setErr(new Error('Montant dû invalide.'))
      return
    }

    const entityKind =
      moduleId === 'PROJET_CONSTRUCTION'
        ? 'CONSTRUCTION_PROJECT'
        : moduleId === 'DOMAINE_ETAT'
          ? 'DOMAINE_ETAT'
          : String(form.entityKind || moduleId)

    let taxpayerName = String(form.taxpayerName ?? '').trim()
    let taxpayerPhone = String(form.taxpayerPhone ?? '').trim()
    let taxpayerEmail = String(form.taxpayerEmail ?? '').trim()

    if (refHit) {
      if (!taxpayerName && refHit.taxpayerName) taxpayerName = refHit.taxpayerName
      if (!taxpayerPhone && refHit.taxpayerPhone) taxpayerPhone = refHit.taxpayerPhone
      if (!taxpayerEmail && refHit.taxpayerEmail) taxpayerEmail = refHit.taxpayerEmail
    }

    if (moduleId === 'PROJET_CONSTRUCTION' && entityId && !taxpayerName) {
      setSaveBusy(true)
      try {
        const raw = await apiFetch<unknown>(
          `/recensement/construction-projects/${encodeURIComponent(entityId)}`,
        )
        const pr = proprietaireFromProjectPayload(raw)
        if (pr.displayName) taxpayerName = pr.displayName
        if (!taxpayerPhone && pr.phone) taxpayerPhone = pr.phone ?? ''
        if (!taxpayerEmail && pr.email) taxpayerEmail = pr.email ?? ''
      } catch {
        /* la fiche liste peut être partielle ; le PDF recharge aussi le chantier */
      } finally {
        setSaveBusy(false)
      }
    }

    if (!entityId && moduleId === 'PROJET_CONSTRUCTION' && !taxpayerName) {
      setErr(
        new Error(
          'Sans fiche liée, indiquez le contribuable pour le bordereau — ou choisissez le projet dans le recensement.',
        ),
      )
      return
    }

    const taxpayerNameFinal = taxpayerName.length ? taxpayerName : null
    const taxpayerPhoneFinal = taxpayerPhone.length ? taxpayerPhone : null
    const taxpayerEmailFinal = taxpayerEmail.length ? taxpayerEmail : null

    const base: Omit<FiscalObligation, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'status'> = {
      moduleId,
      entityKind,
      entityId,
      entityLabel,
      taxpayerName: taxpayerNameFinal,
      taxpayerPhone: taxpayerPhoneFinal,
      taxpayerEmail: taxpayerEmailFinal,
      dossierRef: normDossier(form.dossierRef),
      feeLabel,
      amountDue,
      currency: String(form.currency ?? 'HTG').trim() || 'HTG',
      periodicity: form.periodicity as FiscalPeriodicity,
      periodRef: String(form.periodRef ?? '').trim(),
      dueDate: String(form.dueDate ?? '').trim(),
      notes: String(form.notes ?? '').trim(),
    }

    const t = new Date().toISOString()
    let next: FiscalObligation[]
    let synced: FiscalObligation | null = null
    if (modalMode === 'create') {
      const row: FiscalObligation = withStatus({
        id: newId(),
        ...base,
        payments: [],
        status: 'DUE',
        createdAt: t,
        updatedAt: t,
      })
      synced = row
      next = [...all, row]
    } else {
      if (!selected) return
      const merged: FiscalObligation = withStatus({
        ...selected,
        ...base,
        payments: selected.payments,
      })
      synced = merged
      next = all.map((o) => (o.id === selected.id ? merged : o))
    }
    persist(next)
    closeModal()
    if (synced) {
      try {
        await putFiscalObligation(synced)
      } catch (e) {
        setErr(e)
      }
    }
  }

  const removeObligation = async (o: FiscalObligation) => {
    if (!window.confirm(`Supprimer l’échéance « ${o.feeLabel} » ?`)) return
    setErr(null)
    try {
      await deleteFiscalObligation(o.id)
      persist(all.filter((x) => x.id !== o.id))
    } catch (e) {
      setErr(e)
    }
  }

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

  const linkedRef = useMemo(
    () => (form.entityId ? refEntities.find((r) => r.id === form.entityId) : undefined),
    [form.entityId, refEntities],
  )

  const showLinkedSummary = Boolean(form.entityId && linkedRef && !overrideRecensementFields)
  const showManualRecensementBlock =
    !form.entityId || overrideRecensementFields || Boolean(form.entityId && !linkedRef)

  const modalDetailQuery = useRecensementDetail(
    moduleId,
    form.entityId ? String(form.entityId) : null,
    modalOpen && !!String(form.entityId ?? '').trim(),
  )

  const panelDetailQuery = useRecensementDetail(
    moduleId,
    entityPanel?.id ?? null,
    !!entityPanel?.id && !modalOpen,
  )

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        className="row"
        style={{ justifyContent: 'space-between', padding: 12, borderBottom: '1px solid rgba(0,0,0,0.08)' }}
      >
        <div>
          <div style={{ fontWeight: 900 }}>Fiscalité</div>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <ListToolbarCount
            total={refEntities.length}
            filtered={q.trim() ? entityCardsFiltered.length : undefined}
            busy={refBusy}
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
          <button className="btn primary" type="button" onClick={openCreate}>
            Nouvelle charge
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
              const obs = obligationsForModule.filter((o) => o.entityId === e.id)
              const bal = aggregateBalance(obs)
              const st = worstFiscalStatus(obs)
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
                        {obs.length} charge{obs.length === 1 ? '' : 's'}
                      </span>
                      {st ? (
                        <span className="pill pill--compact mono" data-fiscal={st}>
                          {labelFiscalObligationStatus(st)}
                        </span>
                      ) : (
                        <span className="pill pill--compact mono pill--neutral">Aucune charge</span>
                      )}
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
                {refBusy ? '…' : 'Aucune fiche.'}
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
                <div style={{ fontWeight: 900 }}>Charges fiscales</div>
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
              <div className="row" style={{ marginBottom: 14 }}>
                <button type="button" className="btn primary" onClick={() => openCreateForEntity(entityPanel)}>
                  Nouvelle charge
                </button>
              </div>
              {!panelObligations.length ? (
                <div className="mono" style={{ opacity: 0.8 }}>Aucune charge enregistrée pour cette fiche.</div>
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
                          Période : {o.periodRef || '—'} · Échéance : {o.dueDate || '—'}
                        </div>
                        <div className="user-card-sub mono">
                          Payé : {totalPaid(o).toLocaleString('fr-HT')} {o.currency} · Solde :{' '}
                          {balanceDue(o).toLocaleString('fr-HT')} {o.currency}
                        </div>
                        <div className="user-card-actions" style={{ borderTop: 'none', paddingTop: 8, marginTop: 0 }}>
                          <button type="button" className="btn" onClick={() => openEdit(o)}>
                            Modifier
                          </button>
                          <button type="button" className="btn primary" onClick={() => openPay(o)}>
                            Paiement
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={async () => {
                              try {
                                await downloadBordereauPdf(o)
                              } catch (e) {
                                setErr(e)
                              }
                            }}
                          >
                            Télécharger PDF
                          </button>
                          <button type="button" className="btn danger" onClick={() => removeObligation(o)}>
                            Supprimer
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

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ width: 840, maxWidth: '96vw' }}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>
                {modalMode === 'create' ? 'Nouvelle charge' : 'Modifier la charge'}
              </div>
              <button type="button" className="btn" onClick={closeModal}>
                Fermer
              </button>
            </div>
            <div className="modal-body">
              <div className="grid">
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Lier au recensement</div>
                  <select
                    className="input"
                    value={form.entityId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value
                      setOverrideRecensementFields(false)
                      const hit = id ? refEntities.find((r) => r.id === id) : undefined
                      setForm((f: any) => mergeRefIntoForm(hit, f))
                    }}
                  >
                    <option value="">— Hors recensement (saisie libre) —</option>
                    {refEntities.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.numeroDossier ? `${r.numeroDossier} — ${r.denomination}` : r.denomination}
                      </option>
                    ))}
                  </select>
                </div>

                {form.entityId ? (
                  <>
                    <RecensementDetailSheet
                      busy={modalDetailQuery.busy}
                      err={modalDetailQuery.err}
                      data={modalDetailQuery.data}
                      style={{ gridColumn: '1 / -1' }}
                    />
                    {showLinkedSummary ? (
                      <button
                        type="button"
                        className="btn"
                        style={{ gridColumn: '1 / -1' }}
                        onClick={() => setOverrideRecensementFields(true)}
                      >
                        Modifier pour ce bordereau uniquement
                      </button>
                    ) : null}
                  </>
                ) : null}

                {form.entityId && !linkedRef ? (
                  <div
                    className="mono"
                    style={{
                      gridColumn: '1 / -1',
                      padding: 10,
                      borderRadius: 6,
                      border: '1px solid var(--border-soft)',
                      fontSize: 12,
                      color: 'var(--muted)',
                    }}
                  >
                    Fiche liée absente du chargement courant : complétez la référence ci-dessous ou rechargez les
                    données du module.
                  </div>
                ) : null}

                {showManualRecensementBlock ? (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Référence / objet sur le bordereau</div>
                      <input
                        className="input mono"
                        value={form.entityLabel ?? ''}
                        onChange={(e) => setForm((f: any) => ({ ...f, entityLabel: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Nom affiché (contribuable)</div>
                      <input
                        className="input"
                        value={form.taxpayerName ?? ''}
                        onChange={(e) => setForm((f: any) => ({ ...f, taxpayerName: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Téléphone</div>
                      <input
                        className="input mono"
                        value={form.taxpayerPhone ?? ''}
                        onChange={(e) => setForm((f: any) => ({ ...f, taxpayerPhone: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Courriel</div>
                      <input
                        className="input mono"
                        type="email"
                        value={form.taxpayerEmail ?? ''}
                        onChange={(e) => setForm((f: any) => ({ ...f, taxpayerEmail: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">N° dossier / archive (optionnel)</div>
                      <input
                        className="input mono"
                        value={form.dossierRef ?? ''}
                        onChange={(e) => setForm((f: any) => ({ ...f, dossierRef: e.target.value }))}
                      />
                    </div>
                  </>
                ) : null}

                <div className="field" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  <div className="label" style={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                    Charge et échéance
                  </div>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Nature de la charge (libellé)</div>
                  <input
                    className="input"
                    value={form.feeLabel ?? ''}
                    onChange={(e) => setForm((f: any) => ({ ...f, feeLabel: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <div className="label">Montant dû (HTG ou devise)</div>
                  <input
                    className="input mono"
                    value={form.amountDue ?? ''}
                    onChange={(e) => setForm((f: any) => ({ ...f, amountDue: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <div className="label">Devise</div>
                  <input
                    className="input mono"
                    value={form.currency ?? 'HTG'}
                    onChange={(e) => setForm((f: any) => ({ ...f, currency: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <div className="label">Périodicité (suivi)</div>
                  <select
                    className="input"
                    value={form.periodicity ?? 'MENSUEL'}
                    onChange={(e) => setForm((f: any) => ({ ...f, periodicity: e.target.value }))}
                  >
                    <option value="HEBDO">Hebdomadaire</option>
                    <option value="MENSUEL">Mensuel</option>
                    <option value="ANNUEL">Annuel</option>
                    <option value="PONCTUEL">Ponctuel</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Réf. période (ex. 2026-W12, 2026-05)</div>
                  <input
                    className="input mono"
                    value={form.periodRef ?? ''}
                    onChange={(e) => setForm((f: any) => ({ ...f, periodRef: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <div className="label">Date d’échéance</div>
                  <input
                    type="date"
                    className="input mono"
                    value={form.dueDate ?? ''}
                    onChange={(e) => setForm((f: any) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Notes</div>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={closeModal}>
                Annuler
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={saveBusy}
                onClick={() => void saveObligation()}
              >
                {saveBusy ? 'Synchronisation…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {payOpen && payTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ width: 520, maxWidth: '96vw' }}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>Enregistrer un paiement</div>
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
                Enregistrer le paiement
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function emptyForm(moduleId: FiscalModuleId) {
  return {
    entityId: '',
    entityLabel: '',
    entityKind:
      moduleId === 'PROJET_CONSTRUCTION'
        ? 'CONSTRUCTION_PROJECT'
        : moduleId === 'DOMAINE_ETAT'
          ? 'DOMAINE_ETAT'
          : moduleId,
    dossierRef: '',
    taxpayerName: '',
    taxpayerPhone: '',
    taxpayerEmail: '',
    feeLabel: defaultFeeLabelForModule(moduleId),
    amountDue: '',
    currency: 'HTG',
    periodicity: defaultPeriodicityForModule(moduleId),
    periodRef: '',
    dueDate: '',
    notes: '',
  }
}

function toLocalDatetimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
