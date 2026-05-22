export type AppSettings = {
  apiBaseUrl: string
  accessToken: string | null
  user: {
    id: string
    email: string
    role: string
    displayName: string | null
  } | null
}

const KEY = 'mairieDesktop.settings.v1'

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.mairiedeportdepaix.com'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      return { apiBaseUrl: DEFAULT_API_BASE_URL, accessToken: null, user: null }
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl ? parsed.apiBaseUrl : DEFAULT_API_BASE_URL,
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
      user: parsed.user && typeof parsed.user === 'object'
        ? {
            id: typeof (parsed.user as any).id === 'string' ? (parsed.user as any).id : '',
            email: typeof (parsed.user as any).email === 'string' ? (parsed.user as any).email : '',
            role: typeof (parsed.user as any).role === 'string' ? (parsed.user as any).role : '',
            displayName:
              typeof (parsed.user as any).displayName === 'string' ? (parsed.user as any).displayName : null,
          }
        : null,
    }
  } catch {
    return { apiBaseUrl: DEFAULT_API_BASE_URL, accessToken: null, user: null }
  }
}

export function saveSettings(next: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function clearAuth() {
  const s = loadSettings()
  saveSettings({ ...s, accessToken: null, user: null })
}

