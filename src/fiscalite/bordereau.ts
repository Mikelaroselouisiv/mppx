import { jsPDF } from 'jspdf'
import { apiFetch } from '../api'
import { assetUrl } from '../assetUrl'
import { proprietaireFromProjectPayload } from './constructionProjectFromApi'
import { fetchRecensementDetail } from './fetchRecensementDetail'
import { buildBordereauFicheRows, type BordereauFicheField } from './bordereauFicheRows'
import type { FiscalModuleId, FiscalObligation } from './store'
import { FISCALITE_MODULES, PERIODICITY_LABELS, balanceDue, roundMoney, totalPaid } from './store'
import { labelPaymentMethod } from './paymentMethods'

/** Montants au format comptable (FR) avec caractères ASCII — évite les espaces insécables illisibles dans le PDF. */
function fmtMoney(n: number, currency: string): string {
  const v = roundMoney(Number(n))
  if (!Number.isFinite(v)) return `0,00 ${currency}`.trim()
  const neg = v < 0
  const abs = Math.abs(v)
  const [intPart, frac] = abs.toFixed(2).split('.')
  const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const num = `${neg ? '-' : ''}${intWithSep},${frac}`
  return `${num} ${currency}`.trim()
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const src = assetUrl('mairie-logo.png')
    const img = await loadImage(src)
    const canvas = document.createElement('canvas')
    const w = img.naturalWidth || img.width || 0
    const h = img.naturalHeight || img.height || 0
    if (!w || !h) return null
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Logo introuvable'))
    img.src = src
  })
}

const MARGIN = 18
const TEXT_W = 210 - MARGIN * 2
const LINE = 6
const FICHE_COLS = 3
const FICHE_COL_GAP = 5
const FICHE_COL_W = (TEXT_W - FICHE_COL_GAP * (FICHE_COLS - 1)) / FICHE_COLS
const PAGE_BOTTOM = 275

function ensurePageSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_BOTTOM) {
    doc.addPage()
    return MARGIN
  }
  return y
}

function measureFieldBlock(doc: jsPDF, colW: number, label: string, value: string): number {
  doc.setFontSize(8)
  const labelLines = doc.splitTextToSize(label, colW)
  doc.setFontSize(9)
  const valueLines = doc.splitTextToSize(value, colW)
  return labelLines.length * 3.5 + valueLines.length * 4.2 + 2
}

function drawFieldBlock(doc: jsPDF, x: number, y: number, colW: number, label: string, value: string): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(70)
  const labelLines = doc.splitTextToSize(label, colW)
  let cy = y
  for (const line of labelLines) {
    doc.text(line, x, cy)
    cy += 3.5
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(0)
  const valueLines = doc.splitTextToSize(value, colW)
  for (const line of valueLines) {
    doc.text(line, x, cy)
    cy += 4.2
  }
  return cy - y + 2
}

function appendMultiColumnFiche(doc: jsPDF, fields: BordereauFicheField[], startY: number): number {
  let y = startY
  const colXs = Array.from({ length: FICHE_COLS }, (_, i) => MARGIN + i * (FICHE_COL_W + FICHE_COL_GAP))

  let i = 0
  while (i < fields.length) {
    const field = fields[i]

    if (field.span === 3) {
      const h = measureFieldBlock(doc, TEXT_W, field.label, field.value)
      y = ensurePageSpace(doc, y, h)
      drawFieldBlock(doc, MARGIN, y, TEXT_W, field.label, field.value)
      y += h + 2
      i += 1
      continue
    }

    const rowFields: BordereauFicheField[] = []
    while (rowFields.length < FICHE_COLS && i < fields.length) {
      const f = fields[i]
      if (f.span === 3) break
      rowFields.push(f)
      i += 1
    }

    if (!rowFields.length) continue

    let rowHeight = 0
    for (const f of rowFields) {
      rowHeight = Math.max(rowHeight, measureFieldBlock(doc, FICHE_COL_W, f.label, f.value))
    }
    y = ensurePageSpace(doc, y, rowHeight)

    for (let c = 0; c < rowFields.length; c++) {
      drawFieldBlock(doc, colXs[c], y, FICHE_COL_W, rowFields[c].label, rowFields[c].value)
    }
    y += rowHeight + 3
  }

  return y
}

function addParagraph(doc: jsPDF, text: string, x: number, y: number, fontSize: number): number {
  doc.setFontSize(fontSize)
  const lines = doc.splitTextToSize(text, TEXT_W)
  for (const line of lines) {
    y = ensurePageSpace(doc, y, LINE)
    doc.text(line, x, y)
    y += LINE
  }
  return y + 2
}


function safeFilePart(s: string): string {
  return String(s || 'bordereau')
    .replace(/[^\p{L}\p{N}\-_]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(0, 48)
}

function labelEntityKindForPdf(kind: string, moduleId: FiscalModuleId): string {
  const k = String(kind || '').trim()
  if (k === 'CONSTRUCTION_PROJECT') return 'Projet de construction'
  if (k === 'DOMAINE_ETAT') return 'Domaine de l’État'
  const fromModule = FISCALITE_MODULES.find((m) => m.id === k)
  if (fromModule) return fromModule.label
  const fromModuleFallback = FISCALITE_MODULES.find((m) => m.id === moduleId)
  return fromModuleFallback?.label ?? k
}

function bordereauMotifLine(o: FiscalObligation): string {
  const motif = o.feeLabel.trim() || '—'
  return `Bordereau — ${motif}`
}

function usesFullDescriptiveSheet(moduleId: FiscalModuleId): boolean {
  return moduleId === 'LOGEMENT' || moduleId === 'DOMAINE_ETAT'
}

function showsMayorVisa(moduleId: FiscalModuleId): boolean {
  return moduleId === 'PROJET_CONSTRUCTION' || moduleId === 'LOGEMENT' || moduleId === 'DOMAINE_ETAT'
}

async function fetchProprietaireFromRecensement(o: FiscalObligation) {
  if (o.moduleId !== 'PROJET_CONSTRUCTION' || !o.entityId) return null
  try {
    const raw = await apiFetch<unknown>(
      `/recensement/construction-projects/${encodeURIComponent(o.entityId)}`,
    )
    return proprietaireFromProjectPayload(raw)
  } catch {
    return null
  }
}

async function drawPdfHeader(doc: jsPDF, obligation: FiscalObligation, logo: string | null): Promise<number> {
  let y = MARGIN
  let titleX = MARGIN
  let headerTitleY = MARGIN + 6
  let logoBottom = MARGIN

  if (logo) {
    try {
      const imgW = 22
      const props = doc.getImageProperties(logo)
      const imgH = (props.height * imgW) / props.width
      doc.addImage(logo, 'PNG', MARGIN, MARGIN, imgW, imgH)
      logoBottom = MARGIN + imgH
      headerTitleY = MARGIN + Math.min(imgH * 0.45, 10)
      titleX = MARGIN + imgW + 5
    } catch {
      // logo ignoré si format invalide
    }
  }

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Mairie de Port-de-Paix', titleX, headerTitleY)
  y = Math.max(logoBottom + 3, headerTitleY + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  y = addParagraph(doc, bordereauMotifLine(obligation), MARGIN, y, 11)
  doc.setFont('helvetica', 'normal')
  return y
}

function appendMayorVisa(doc: jsPDF, y: number): number {
  if (y > 248) {
    doc.addPage()
    y = MARGIN
  }
  y += 10
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text('Vu et approuvé par :', MARGIN, Math.min(y + 8, 282))
  doc.setFont('helvetica', 'normal')
  return y
}

function appendEstimationSection(
  doc: jsPDF,
  obligation: FiscalObligation,
  y: number,
  sectionTitle = 'Estimation',
): number {
  const paid = totalPaid(obligation)
  const balance = balanceDue(obligation)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  y = addParagraph(doc, sectionTitle, MARGIN, y + 4, 12)
  doc.setFont('helvetica', 'normal')

  doc.setFontSize(11)
  y = addParagraph(doc, obligation.feeLabel, MARGIN, y, 11)
  doc.setFontSize(9)
  y = addParagraph(
    doc,
    `Périodicité : ${PERIODICITY_LABELS[obligation.periodicity]} — Période : ${obligation.periodRef || '—'}`,
    MARGIN,
    y,
    9,
  )
  y = addParagraph(doc, `Échéance : ${obligation.dueDate || '—'}`, MARGIN, y, 9)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  y = addParagraph(doc, `Montant dû : ${fmtMoney(obligation.amountDue, obligation.currency)}`, MARGIN, y, 10)
  doc.setFont('helvetica', 'normal')
  y = addParagraph(doc, `Déjà payé : ${fmtMoney(paid, obligation.currency)}`, MARGIN, y, 10)
  doc.setFont('helvetica', 'bold')
  y = addParagraph(doc, `Solde : ${fmtMoney(balance, obligation.currency)}`, MARGIN, y, 10)
  doc.setFont('helvetica', 'normal')

  if (obligation.notes.trim()) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    y = addParagraph(doc, 'Notes', MARGIN, y, 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    y = addParagraph(doc, obligation.notes.trim(), MARGIN, y, 9)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  y = addParagraph(doc, 'Paiements enregistrés', MARGIN, y, 12)
  doc.setFont('helvetica', 'normal')

  const payments = obligation.payments.slice().sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
  if (!payments.length) {
    doc.setFontSize(9)
    y = addParagraph(doc, 'Aucun paiement', MARGIN, y, 9)
  } else {
    for (const p of payments) {
      const dt = p.paidAt.slice(0, 16).replace('T', ' ')
      const line = `${dt} — ${labelPaymentMethod(p.method)} — ${p.reference || '—'} — ${fmtMoney(p.amount, obligation.currency)}`
      if (y > 265) {
        doc.addPage()
        y = MARGIN
      }
      doc.setFontSize(9)
      const wrapped = doc.splitTextToSize(line, TEXT_W)
      for (const wline of wrapped) {
        if (y > 275) {
          doc.addPage()
          y = MARGIN
        }
        doc.text(wline, MARGIN, y)
        y += LINE
      }
      if (p.notes.trim()) {
        doc.setFontSize(8)
        const nlines = doc.splitTextToSize(`  └ ${p.notes.trim()}`, TEXT_W - 4)
        for (const nl of nlines) {
          if (y > 275) {
            doc.addPage()
            y = MARGIN
          }
          doc.text(nl, MARGIN + 4, y)
          y += LINE - 1
        }
        doc.setFontSize(9)
      }
      y += 2
    }
  }

  return y
}

function appendContribuableSection(
  doc: jsPDF,
  obligation: FiscalObligation,
  y: number,
  liveProprietaire: Awaited<ReturnType<typeof fetchProprietaireFromRecensement>>,
): number {
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  y = addParagraph(doc, 'Contribuable', MARGIN, y, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const namePrimary =
    liveProprietaire?.displayName?.trim() ||
    obligation.taxpayerName?.trim() ||
    (obligation.moduleId !== 'PROJET_CONSTRUCTION' ? obligation.entityLabel.trim() : '')
  if (namePrimary) {
    y = addParagraph(doc, namePrimary, MARGIN, y, 11)
  } else {
    doc.setFontSize(10)
    doc.setTextColor(90)
    y = addParagraph(
      doc,
      'Nom et prénom non renseignés dans le recensement (ou fiche charge).',
      MARGIN,
      y,
      10,
    )
    doc.setTextColor(0)
  }
  const phone = liveProprietaire?.phone || obligation.taxpayerPhone?.trim() || ''
  const email = liveProprietaire?.email || obligation.taxpayerEmail?.trim() || ''
  if (phone) {
    doc.setFontSize(10)
    y = addParagraph(doc, `Téléphone : ${phone}`, MARGIN, y, 10)
  }
  if (email) {
    doc.setFontSize(10)
    y = addParagraph(doc, `Courriel : ${email}`, MARGIN, y, 10)
  }
  const showChantierLine =
    obligation.moduleId === 'PROJET_CONSTRUCTION' &&
    obligation.entityLabel.trim() &&
    obligation.entityLabel.trim() !== namePrimary
  if (showChantierLine) {
    doc.setFontSize(10)
    y = addParagraph(doc, `Chantier / réf. : ${obligation.entityLabel}`, MARGIN, y, 10)
  }

  if (obligation.dossierRef) {
    doc.setFontSize(10)
    y = addParagraph(doc, `N° dossier / archive : ${obligation.dossierRef}`, MARGIN, y, 10)
  }
  doc.setFontSize(9)
  const kindFr = labelEntityKindForPdf(obligation.entityKind, obligation.moduleId)
  const recRef = `Réf. recensement : ${kindFr}${obligation.entityId ? ` — ${obligation.entityId}` : ''}`
  y = addParagraph(doc, recRef, MARGIN, y, 9)
  return y
}

async function appendFullDescriptiveSheet(
  doc: jsPDF,
  obligation: FiscalObligation,
  y: number,
): Promise<number> {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  y = addParagraph(doc, 'Fiche descriptive', MARGIN, y + 2, 12)
  doc.setFont('helvetica', 'normal')

  if (!obligation.entityId) {
    doc.setFontSize(10)
    doc.setTextColor(90)
    y = addParagraph(doc, 'Aucune fiche recensement liée à cette obligation.', MARGIN, y, 10)
    doc.setTextColor(0)
    return y
  }

  try {
    const raw = await fetchRecensementDetail(obligation.moduleId, obligation.entityId)
    const fields = buildBordereauFicheRows(raw, obligation.moduleId)
    if (!fields.length) {
      doc.setFontSize(10)
      y = addParagraph(doc, 'Fiche recensement sans détail exploitable.', MARGIN, y, 10)
      return y
    }
    y = appendMultiColumnFiche(doc, fields, y + 2)
  } catch {
    doc.setFontSize(10)
    doc.setTextColor(90)
    y = addParagraph(
      doc,
      'Impossible de charger la fiche recensement complète. Vérifiez le lien avec la fiche source.',
      MARGIN,
      y,
      10,
    )
    doc.setTextColor(0)
  }

  return y
}

/**
 * Génère un fichier PDF local (aucun service externe) et déclenche le téléchargement.
 */
export async function downloadBordereauPdf(obligation: FiscalObligation) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const [logo, liveProprietaire] = await Promise.all([
    fetchLogoDataUrl(),
    fetchProprietaireFromRecensement(obligation),
  ])

  let y = await drawPdfHeader(doc, obligation, logo)

  if (usesFullDescriptiveSheet(obligation.moduleId)) {
    y = await appendFullDescriptiveSheet(doc, obligation, y)
    y = appendEstimationSection(doc, obligation, y)
    if (showsMayorVisa(obligation.moduleId)) {
      appendMayorVisa(doc, y)
    }
  } else {
    y = appendContribuableSection(doc, obligation, y, liveProprietaire)
    y = appendEstimationSection(doc, obligation, y, 'Redevance')
    if (showsMayorVisa(obligation.moduleId)) {
      appendMayorVisa(doc, y)
    }
  }

  const part = obligation.dossierRef || safeFilePart(obligation.feeLabel)
  doc.save(`Bordereau_${part}_${obligation.id.slice(0, 8)}.pdf`)
}

/** @deprecated Utiliser downloadBordereauPdf — alias pour les imports existants. */
export async function printBordereau(obligation: FiscalObligation) {
  await downloadBordereauPdf(obligation)
}
