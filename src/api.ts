import { loadSettings, saveSettings } from './storage'

export class ApiError extends Error {
  status: number
  payload: unknown
  constructor(message: string, status: number, payload: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

function normalizeBaseUrl(u: string) {
  return u.replace(/\/+$/, '')
}

async function parseJsonSafe(res: Response) {
  const t = await res.text()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

async function parseJsonSafeText(t: string) {
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const s = loadSettings()
  const url = `${normalizeBaseUrl(s.apiBaseUrl)}${path.startsWith('/') ? '' : '/'}${path}`

  const headersObj: Record<string, string> = {}
  const srcHeaders = init?.headers
  if (srcHeaders && typeof srcHeaders === 'object') {
    // Best-effort conversion; we mostly pass simple objects anyway.
    for (const [k, v] of Object.entries(srcHeaders as any)) {
      if (typeof v === 'string') headersObj[k] = v
    }
  }
  headersObj['Accept'] = 'application/json'
  if (!(init?.body instanceof FormData)) {
    headersObj['Content-Type'] = headersObj['Content-Type'] || 'application/json'
  }
  if (s.accessToken) {
    headersObj['Authorization'] = `Bearer ${s.accessToken}`
  }

  // In Electron renderer, direct fetch can fail due to CORS. Route through main via preload.
  const bridge = (window as any).mairieDesktop?.apiRequest as
    | undefined
    | ((req: { url: string; method: string; headers: Record<string, string>; body?: string }) => Promise<any>)

  if (!bridge) {
    throw new Error('Bridge API indisponible')
  }

  const body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : undefined
  const method = init?.method || 'GET'

  const r = await bridge({ url, method, headers: headersObj, body })
  const status = Number(r?.status || 0)
  const text = typeof r?.text === 'string' ? r.text : ''
  const payload = await parseJsonSafeText(text)

  if (status === 401) {
    saveSettings({ ...s, accessToken: null, user: null })
  }
  if (!r?.ok) {
    const msg =
      typeof payload === 'object' && payload && 'message' in (payload as any)
        ? String((payload as any).message)
        : status
          ? `HTTP ${status}`
          : 'Impossible de contacter le serveur'
    throw new ApiError(msg, status || 0, payload)
  }
  return payload as T
}

export async function putBinary(url: string, bytes: Uint8Array, headers: Record<string, string>) {
  const bridge = (window as any).mairieDesktop?.putBinary as
    | undefined
    | ((req: { url: string; headers: Record<string, string>; bytes: Uint8Array }) => Promise<any>)
  if (!bridge) throw new Error('Bridge binaire indisponible')

  const r = await bridge({ url, headers, bytes })
  const status = Number(r?.status || 0)
  const text = typeof r?.text === 'string' ? r.text : ''
  if (!r?.ok) {
    throw new ApiError(status ? `HTTP ${status}` : 'Upload impossible', status || 0, text)
  }
  return { ok: true as const, status, text }
}

export type LoginResponse = {
  access_token: string
  user: {
    id: string
    email: string
    role: string
    isActive: boolean
    telephone: string | null
    displayName: string | null
    address: string | null
    profilePhotoUrl: string | null
    nif: string | null
    nin: string | null
  }
}

export async function login(identifier: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
}

export async function me() {
  return apiFetch<{ user: any }>('/auth/me')
}

declare global {
  interface Window {
    mairieDesktop?: {
      apiRequest?: (req: {
        url: string
        method: string
        headers: Record<string, string>
        body?: string
      }) => Promise<{ ok: boolean; status: number; text: string }>
      putBinary?: (req: { url: string; headers: Record<string, string>; bytes: Uint8Array }) => Promise<{
        ok: boolean
        status: number
        text: string
      }>
    }
  }
}

