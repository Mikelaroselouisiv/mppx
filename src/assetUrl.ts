/** Construit une URL d’asset compatible Vite (dev + build + base './' pour Electron file://). */
export function assetUrl(filename: string): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
      ? String(import.meta.env.BASE_URL)
      : '/'
  const b = base.endsWith('/') ? base : base + '/'
  return b + String(filename).replace(/^\/+/, '')
}

