import { apiFetch } from '../api'
import type { GeoMapPoint } from './mapModules'

export async function presignPhotoUrl(key: string): Promise<string | null> {
  const k = key.trim()
  if (!k) return null
  try {
    const r = await apiFetch<{ url: string }>(`/uploads/s3/presign-get?key=${encodeURIComponent(k)}`)
    return typeof r?.url === 'string' ? r.url : null
  } catch {
    return null
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Contenu de la bulle carte : photo, nom, contact (sans coordonnées GPS). */
export function buildGeoPopupHtml(p: GeoMapPoint, imageUrl: string | null): string {
  const img = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="" class="geo-popup-img" />`
    : `<div class="geo-popup-img geo-popup-img--empty" aria-hidden="true"></div>`
  const dossier = p.numeroDossier
    ? `<div class="geo-popup-dossier mono">${escapeHtml(p.numeroDossier)}</div>`
    : ''
  const phone = p.phone
    ? `<div class="geo-popup-phone mono">${escapeHtml(p.phone)}</div>`
    : p.email
      ? `<div class="geo-popup-phone mono">${escapeHtml(p.email)}</div>`
      : ''
  return `<div class="geo-popup">
    ${img}
    <div class="geo-popup-body">
      <div class="geo-popup-name">${escapeHtml(p.label)}</div>
      ${dossier}
      ${phone}
    </div>
  </div>`
}
