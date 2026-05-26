import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiFetch, login, me as fetchMe, putBinary } from './api'
import { getUserFacingApiMessage } from './apiErrors'
import { assetUrl } from './assetUrl'
import { EntityViewModal } from './components/EntityViewModal'
import { ListToolbarCount } from './components/ListToolbarCount'
import { RecensementEntityCard } from './components/RecensementEntityCard'
import { S3ObjectImage } from './components/S3ObjectImage'
import { entityCardFromRaw } from './fiscalite/entityCardFields'
import { sortByCreatedAtDesc } from './fiscalite/sortByCreatedAt'
import { FiscalitePage } from './FiscalitePage'
import { GeographicMonitorPage } from './GeographicMonitorPage'
import { RecouvrementPage } from './RecouvrementPage'
import { canAccessNavTab, filterRecensementModules, getNavAccess, type RecensementModuleId } from './navAccess'
import { AppSettings, clearAuth, loadSettings, saveSettings } from './storage'

type Tab =
  | 'home'
  | 'administration'
  | 'administration-users'
  | 'administration-roles'
  | 'administration-marches'
  | 'administration-cimetieres'
  | 'recensement'
  | 'fiscalite'
  | 'recouvrement'
  | 'geographic-monitor'

function pretty(v: unknown) {
  return JSON.stringify(v, null, 2)
}

function ErrorBox({ err }: { err: unknown }) {
  if (!err) return null
  return (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Erreur</div>
      <div>{getUserFacingApiMessage(err)}</div>
    </div>
  )
}

function JsonTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <textarea
      className="input mono"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={10}
      style={{ resize: 'vertical' }}
    />
  )
}

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [tab, setTab] = useState<Tab>('home')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [mePayload, setMePayload] = useState<unknown>(null)

  const isAuthed = !!settings.accessToken && !!settings.user?.role

  const persistSettings = (next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  const doMe = async () => {
    setErr(null)
    setBusy(true)
    try {
      const r = await fetchMe()
      setMePayload(r)
    } catch (e) {
      setErr(e)
      setMePayload(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    // If we have a token, refresh the user payload (role-driven UI).
    const run = async () => {
      if (!settings.accessToken) return
      setBusy(true)
      setErr(null)
      try {
        const r = await fetchMe()
        const user = (r as any)?.user ?? null
        const nextUser =
          user && typeof user === 'object'
            ? {
                id: String((user as any).sub ?? ''),
                email: String((user as any).email ?? ''),
                role: String((user as any).role ?? ''),
                displayName:
                  typeof (user as any).displayName === 'string' ? (user as any).displayName : null,
              }
            : null
        const next = { ...settings, user: nextUser }
        persistSettings(next)
        setMePayload(r)
      } catch (e) {
        setErr(e)
      } finally {
        setBusy(false)
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const role = settings.user?.role ?? ''
  const navAccess = useMemo(() => getNavAccess(role), [role])

  useEffect(() => {
    if (!isAuthed) return
    if (!canAccessNavTab(tab, navAccess)) {
      setTab('home')
    }
  }, [isAuthed, tab, navAccess])

  return (
    <div className="container">
      {isAuthed ? (
        <header className="header">
          <div className="header-left">
            <img className="logo" src={assetUrl('mairie-logo.png')} alt="Mairie de Port-de-Paix" />
            <div className="header-title">
              <div className="title">Mairie de Port-de-Paix</div>
            </div>
          </div>
          <div className="header-right">
            <button
              className="btn danger"
              onClick={() => {
                clearAuth()
                const next = loadSettings()
                setSettings(next)
                setMePayload(null)
                setTab('home')
              }}
            >
              Déconnexion
            </button>
          </div>
        </header>
      ) : null}

      {isAuthed ? (
        <nav className="nav">
          <button className={`btn ${tab === 'home' ? 'primary' : ''}`} onClick={() => setTab('home')}>
            Accueil
          </button>
          {navAccess.administration ? (
            <button
              className={`btn ${
                tab === 'administration' || tab.startsWith('administration-') ? 'primary' : ''
              }`}
              onClick={() => setTab('administration')}
            >
              Administration
            </button>
          ) : null}
          {navAccess.recensement ? (
            <button className={`btn ${tab === 'recensement' ? 'primary' : ''}`} onClick={() => setTab('recensement')}>
              Recensement
            </button>
          ) : null}
          {navAccess.fiscalite ? (
            <button className={`btn ${tab === 'fiscalite' ? 'primary' : ''}`} onClick={() => setTab('fiscalite')}>
              Fiscalité
            </button>
          ) : null}
          {navAccess.recouvrement ? (
            <button
              className={`btn ${tab === 'recouvrement' ? 'primary' : ''}`}
              onClick={() => setTab('recouvrement')}
            >
              Recouvrement
            </button>
          ) : null}
          {navAccess.geographicMonitor ? (
            <button
              className={`btn ${tab === 'geographic-monitor' ? 'primary' : ''}`}
              onClick={() => setTab('geographic-monitor')}
            >
              Moniteur géographique
            </button>
          ) : null}
        </nav>
      ) : null}

      {err ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorBox err={err} />
        </div>
      ) : null}

      {!isAuthed && tab === 'home' ? (
        <HomeLoginView
          busy={busy}
          onLogin={async (identifier, password) => {
            setErr(null)
            setBusy(true)
            try {
              const r = await login(identifier, password)
              const next = {
                ...settings,
                accessToken: r.access_token,
                user: {
                  id: r.user.id,
                  email: r.user.email,
                  role: r.user.role,
                  displayName: r.user.displayName,
                },
              }
              persistSettings(next)
              setMePayload({ user: r.user })
              setTab('home')
            } catch (e) {
              setErr(e)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {isAuthed && tab === 'home' ? (
        <HomeAuthedView
          settings={settings}
          mePayload={mePayload}
          busy={busy}
          onRefreshMe={() => void doMe()}
        />
      ) : null}

      {isAuthed && tab === 'administration' && canAccessNavTab(tab, navAccess) ? (
        <AdministrationHome
          onOpen={(t) => setTab(t)}
          canUsers={navAccess.administrationUsers}
          canRoles={navAccess.administrationRoles}
          canMarches={navAccess.administrationMarches}
          canCimetieres={navAccess.administrationCimetieres}
        />
      ) : null}
      {isAuthed && tab === 'administration-users' && canAccessNavTab(tab, navAccess) ? (
        <AdministrationUsersPage />
      ) : null}
      {isAuthed && tab === 'administration-roles' && canAccessNavTab(tab, navAccess) ? (
        <AdministrationRolesPage />
      ) : null}
      {isAuthed && tab === 'administration-marches' && canAccessNavTab(tab, navAccess) ? (
        <AdministrationMarchesPage />
      ) : null}
      {isAuthed && tab === 'administration-cimetieres' && canAccessNavTab(tab, navAccess) ? (
        <AdministrationCimetieresPage />
      ) : null}
      {isAuthed && tab === 'recensement' && canAccessNavTab(tab, navAccess) ? (
        <RecensementPage
          canWrite={navAccess.recensementWrite}
          allowedModules={navAccess.recensementModules}
        />
      ) : null}
      {isAuthed && tab === 'fiscalite' && canAccessNavTab(tab, navAccess) ? (
        <FiscalitePage canWriteRecensement={navAccess.recensementWrite} />
      ) : null}
      {isAuthed && tab === 'recouvrement' && canAccessNavTab(tab, navAccess) ? (
        <RecouvrementPage canWriteRecensement={navAccess.recensementWrite} />
      ) : null}
      {isAuthed && tab === 'geographic-monitor' && canAccessNavTab(tab, navAccess) ? (
        <GeographicMonitorPage allowedModules={navAccess.recensementModules} />
      ) : null}
    </div>
  )
}

function AdministrationHome({
  onOpen,
  canUsers,
  canRoles,
  canMarches,
  canCimetieres,
}: {
  onOpen: (t: Tab) => void
  canUsers: boolean
  canRoles: boolean
  canMarches: boolean
  canCimetieres: boolean
}) {
  const [counts, setCounts] = useState<{
    users: number | null
    roles: number | null
    marches: number | null
    cimetieres: number | null
  }>({ users: null, roles: null, marches: null, cimetieres: null })

  useEffect(() => {
    const jobs: Promise<void>[] = []
    if (canUsers) {
      jobs.push(
        apiFetch<any>('/admin/users')
          .then((r) => setCounts((c) => ({ ...c, users: normalizeUsers(r).length })))
          .catch(() => setCounts((c) => ({ ...c, users: null }))),
      )
    }
    if (canRoles) {
      jobs.push(
        apiFetch<any>('/admin/roles')
          .then((r) => setCounts((c) => ({ ...c, roles: normalizeRoles(r).length })))
          .catch(() => setCounts((c) => ({ ...c, roles: null }))),
      )
    }
    if (canMarches) {
      jobs.push(
        apiFetch<any>('/admin/marches')
          .then((r) => setCounts((c) => ({ ...c, marches: normalizeRefs(r).length })))
          .catch(() => setCounts((c) => ({ ...c, marches: null }))),
      )
    }
    if (canCimetieres) {
      jobs.push(
        apiFetch<any>('/admin/cimetieres')
          .then((r) => setCounts((c) => ({ ...c, cimetieres: normalizeRefs(r).length })))
          .catch(() => setCounts((c) => ({ ...c, cimetieres: null }))),
      )
    }
    void Promise.all(jobs)
  }, [canUsers, canRoles, canMarches, canCimetieres])

  const summaryParts: string[] = []
  if (canUsers && counts.users != null) {
    summaryParts.push(`${counts.users} utilisateur${counts.users > 1 ? 's' : ''}`)
  }
  if (canRoles && counts.roles != null) {
    summaryParts.push(`${counts.roles} rôle${counts.roles > 1 ? 's' : ''}`)
  }
  if (canMarches && counts.marches != null) {
    summaryParts.push(`${counts.marches} marché${counts.marches > 1 ? 's' : ''}`)
  }
  if (canCimetieres && counts.cimetieres != null) {
    summaryParts.push(`${counts.cimetieres} cimetière${counts.cimetieres > 1 ? 's' : ''}`)
  }

  return (
    <div className="card">
      <div className="admin-home-header">
        <div style={{ fontWeight: 900 }}>Administration</div>
        {summaryParts.length ? (
          <div className="admin-home-stats mono">{summaryParts.join(' · ')}</div>
        ) : null}
      </div>
      <div className="admin-grid">
        {canUsers ? (
          <button className="admin-tile" onClick={() => onOpen('administration-users')}>
            <div className="admin-tile-title">Utilisateurs</div>
            {counts.users != null ? (
              <div className="admin-tile-count mono">{counts.users}</div>
            ) : null}
          </button>
        ) : null}
        {canRoles ? (
          <button className="admin-tile" onClick={() => onOpen('administration-roles')}>
            <div className="admin-tile-title">Rôles</div>
            {counts.roles != null ? (
              <div className="admin-tile-count mono">{counts.roles}</div>
            ) : null}
          </button>
        ) : null}
        {canMarches ? (
          <button className="admin-tile" onClick={() => onOpen('administration-marches')}>
            <div className="admin-tile-title">Marchés</div>
            {counts.marches != null ? (
              <div className="admin-tile-count mono">{counts.marches}</div>
            ) : null}
          </button>
        ) : null}
        {canCimetieres ? (
          <button className="admin-tile" onClick={() => onOpen('administration-cimetieres')}>
            <div className="admin-tile-title">Cimetières</div>
            {counts.cimetieres != null ? (
              <div className="admin-tile-count mono">{counts.cimetieres}</div>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function BlankPage({ title }: { title: string }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 900 }}>{title}</div>
    </div>
  )
}

type AdminUser = {
  id: string
  email: string
  role: string
  isActive: boolean
  telephone: string | null
  prenom?: string | null
  nom?: string | null
  displayName: string | null
  address: string | null
  profilePhotoUrl: string | null
  nif: string | null
  nin: string | null
}

type RoleItem = {
  code: string
  label: string
  description: string | null
  isSystem: boolean
  active: boolean
}

type RefItem = {
  id: string
  nom: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

function normalizeUsers(payload: any): AdminUser[] {
  if (Array.isArray(payload)) return payload as AdminUser[]
  const candidates = [payload?.items, payload?.data, payload?.users, payload?.results]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as AdminUser[]
  }
  return []
}

function normalizeRoles(payload: any): RoleItem[] {
  if (Array.isArray(payload)) return payload as RoleItem[]
  const candidates = [payload?.items, payload?.data, payload?.roles, payload?.results]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as RoleItem[]
  }
  return []
}

function normalizeRefs(payload: any): RefItem[] {
  if (Array.isArray(payload)) return payload as RefItem[]
  const candidates = [payload?.items, payload?.data, payload?.marches, payload?.cimetieres, payload?.results]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as RefItem[]
  }
  return []
}

function toForm(u: Partial<AdminUser> | null) {
  const prenom = typeof (u as any)?.prenom === 'string' ? String((u as any).prenom) : ''
  const nom = typeof (u as any)?.nom === 'string' ? String((u as any).nom) : ''
  return {
    id: typeof u?.id === 'string' ? u!.id : '',
    email: typeof u?.email === 'string' ? u!.email : '',
    role: typeof u?.role === 'string' ? u!.role : '',
    isActive: typeof u?.isActive === 'boolean' ? u!.isActive : true,
    telephone: typeof u?.telephone === 'string' ? u!.telephone : '',
    prenom,
    nom,
    displayName: typeof u?.displayName === 'string' ? u!.displayName : prenom || nom ? `${prenom} ${nom}`.trim() : '',
    address: typeof u?.address === 'string' ? u!.address : '',
    profilePhotoUrl: typeof u?.profilePhotoUrl === 'string' ? u!.profilePhotoUrl : '',
    nif: typeof u?.nif === 'string' ? u!.nif : '',
    nin: typeof u?.nin === 'string' ? u!.nin : '',
    password: '',
    passwordConfirm: '',
  }
}

async function compressImageToWebpOrJpeg(file: File): Promise<{
  bytes: Uint8Array
  contentType: string
  extension: string
  localPreviewUrl: string
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Veuillez sélectionner une image.')
  }
  const localPreviewUrl = URL.createObjectURL(file)

  // Prefer createImageBitmap (fast + off-main-thread decode in many browsers).
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    URL.revokeObjectURL(localPreviewUrl)
    throw new Error("Impossible de lire l'image.")
  }

  const maxSide = 768
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    URL.revokeObjectURL(localPreviewUrl)
    throw new Error('Canvas indisponible.')
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible.'))), type, quality)
    })

  let blob: Blob
  let contentType = 'image/webp'
  let extension = 'webp'
  try {
    blob = await toBlob('image/webp', 0.82)
  } catch {
    contentType = 'image/jpeg'
    extension = 'jpg'
    blob = await toBlob('image/jpeg', 0.82)
  }

  const ab = await blob.arrayBuffer()
  return { bytes: new Uint8Array(ab), contentType, extension, localPreviewUrl }
}

function Avatar({
  src,
  alt,
  className,
}: {
  src: string | null | undefined
  alt?: string
  className: string
}) {
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setResolved(null)
    const raw = typeof src === 'string' ? src.trim() : ''
    if (!raw) return () => { alive = false }

    if (raw.startsWith('s3:')) {
      const key = raw.slice(3).trim()
      if (!key) return () => { alive = false }
      void (async () => {
        try {
          const r = await apiFetch<{ url: string }>(`/uploads/s3/presign-get?key=${encodeURIComponent(key)}`)
          if (!alive) return
          setResolved(typeof r?.url === 'string' ? r.url : null)
        } catch {
          if (!alive) return
          setResolved(null)
        }
      })()
    } else {
      setResolved(raw)
    }

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const finalSrc = resolved
  return finalSrc ? <img className={className} src={finalSrc} alt={alt ?? ''} /> : <div className="avatar-fallback" />
}

function AdministrationUsersPage() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [q, setQ] = useState('')
  const [roles, setRoles] = useState<RoleItem[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('view')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [form, setForm] = useState(() => toForm(null))
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoErr, setPhotoErr] = useState<string | null>(null)
  const [localPhotoPreview, setLocalPhotoPreview] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const actorRole = loadSettings().user?.role ?? ''
  const canEditPassword = actorRole === 'super_admin'

  const openCreate = () => {
    setSelected(null)
    setForm(toForm(null))
    setPhotoErr(null)
    setLocalPhotoPreview(null)
    setShowPw(false)
    setShowPw2(false)
    setModalMode('create')
    setModalOpen(true)
  }

  const openView = (u: AdminUser) => {
    setSelected(u)
    setForm(toForm(u))
    setPhotoErr(null)
    setLocalPhotoPreview(null)
    setShowPw(false)
    setShowPw2(false)
    setModalMode('view')
    setModalOpen(true)
  }

  const openEdit = () => {
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalMode('view')
    setSelected(null)
    setPhotoErr(null)
    if (localPhotoPreview) URL.revokeObjectURL(localPhotoPreview)
    setLocalPhotoPreview(null)
    setShowPw(false)
    setShowPw2(false)
  }

  const uploadPickedPhotoToS3 = async (file: File) => {
    setPhotoErr(null)
    setPhotoBusy(true)
    try {
      const { bytes, contentType, extension, localPreviewUrl } = await compressImageToWebpOrJpeg(file)
      if (localPhotoPreview) URL.revokeObjectURL(localPhotoPreview)
      setLocalPhotoPreview(localPreviewUrl)

      const presign = await apiFetch<{
        bucket: string
        region: string
        key: string
        uploadUrl: string
        expiresIn: number
        headers: Record<string, string>
      }>('/uploads/s3/presign-upload', {
        method: 'POST',
        body: JSON.stringify({ contentType, extension, folder: 'profile-photos' }),
      })

      await putBinary(presign.uploadUrl, bytes, presign.headers)

      // Bucket can be private → store the key and resolve display URLs via presigned GET.
      setForm((v) => ({ ...v, profilePhotoUrl: `s3:${presign.key}` }))
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : String(e))
      // Best-effort: report upload issues to backend trace endpoint (if available).
      try {
        await apiFetch('/uploads/s3/upload-trace', {
          method: 'POST',
          body: JSON.stringify({
            stage: 'profile_photo_upload',
            message: e instanceof Error ? e.message : String(e),
            platform: 'electron-renderer',
          }),
        })
      } catch {
        // ignore
      }
    } finally {
      setPhotoBusy(false)
    }
  }

  const load = async () => {
    setErr(null)
    setBusy(true)
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiFetch<any>('/admin/users'),
        apiFetch<any>('/admin/roles'),
      ])
      setUsers(normalizeUsers(usersRes))
      setRoles(normalizeRoles(rolesRes))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter((u) => {
      const name = (u.displayName ?? '').toLowerCase()
      const email = (u.email ?? '').toLowerCase()
      const tel = (u.telephone ?? '').toLowerCase()
      const role = (u.role ?? '').toLowerCase()
      return name.includes(s) || email.includes(s) || tel.includes(s) || role.includes(s)
    })
  }, [users, q])

  const save = async () => {
    setErr(null)
    setBusy(true)
    try {
      const photoValue = form.profilePhotoUrl.trim()
      if (photoValue.startsWith('data:')) {
        // Hard guard (payload bloat → 413). If still too big after compression, ask for URL upload flow later.
        const approxBytes = Math.ceil((photoValue.length * 3) / 4)
        if (approxBytes > 450_000) {
          throw new Error('Photo trop lourde. Choisis une image plus petite ou réduis-la.')
        }
      }
      const common = {
        email: form.email.trim(),
        role: form.role.trim(),
        telephone: form.telephone.trim(),
        prenom: (form as any).prenom?.trim?.() ?? '',
        nom: (form as any).nom?.trim?.() ?? '',
        displayName: form.displayName.trim(),
        address: form.address.trim(),
        profilePhotoUrl: photoValue,
        nif: form.nif.trim(),
        nin: form.nin.trim(),
      }

      // Backend contract differences:
      // - Create: optional fields should be omitted when empty (not null); password is required; isActive is not accepted.
      // - Update: optional fields can be set to null to clear; isActive is accepted.
      const payload: any =
        modalMode === 'create'
          ? (() => {
              const password = form.password.trim()
              const confirm = (form as any).passwordConfirm?.trim?.() ?? ''
              if (!password) throw new Error('Mot de passe requis (minimum 8 caractères).')
              if (password.length < 8) throw new Error('Mot de passe trop court (minimum 8 caractères).')
              if (!confirm) throw new Error('Confirmation du mot de passe requise.')
              if (password !== confirm) throw new Error('Les mots de passe ne correspondent pas.')

              const p: any = {
                email: common.email,
                role: common.role,
                password,
              }
              if (common.telephone) p.telephone = common.telephone
              // New contract: send prenom/nom separately (backend will store both + compute displayName)
              if (common.prenom) p.prenom = common.prenom
              if (common.nom) p.nom = common.nom
              if (!common.prenom && !common.nom && common.displayName) p.displayName = common.displayName
              if (common.address) p.address = common.address
              if (common.profilePhotoUrl) p.profilePhotoUrl = common.profilePhotoUrl
              if (common.nif) p.nif = common.nif
              if (common.nin) p.nin = common.nin
              return p
            })()
          : {
              email: common.email || undefined,
              role: common.role || undefined,
              isActive: !!form.isActive,
              telephone: common.telephone || null,
              prenom: common.prenom || null,
              nom: common.nom || null,
              displayName: common.displayName || null,
              address: common.address || null,
              profilePhotoUrl: common.profilePhotoUrl || null,
              nif: common.nif || null,
              nin: common.nin || null,
              ...(form.password.trim()
                ? (() => {
                    const pw = form.password.trim()
                    const confirm = (form as any).passwordConfirm?.trim?.() ?? ''
                    if (pw.length < 8) throw new Error('Mot de passe trop court (minimum 8 caractères).')
                    if (!confirm) throw new Error('Confirmation du mot de passe requise.')
                    if (pw !== confirm) throw new Error('Les mots de passe ne correspondent pas.')
                    return { password: pw }
                  })()
                : {}),
            }

      if (modalMode === 'create') {
        await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        if (!form.id) throw new Error('ID utilisateur manquant')
        await apiFetch(`/admin/users/${encodeURIComponent(form.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }

      await load()
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async (u: AdminUser) => {
    if (!window.confirm(`Supprimer l'utilisateur "${u.displayName || u.email}" ?`)) return
    setErr(null)
    setBusy(true)
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(u.id)}`, { method: 'DELETE' })
      await load()
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>Administration • Utilisateurs</div>
        <div className="row">
          <input
            className="input mono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            style={{ width: 240 }}
          />
          <button className="btn" onClick={load} disabled={busy}>
            Actualiser
          </button>
          <button className="btn primary" onClick={openCreate} disabled={busy}>
            Nouveau
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorBox err={err} />
        </div>
      ) : null}

      <div className="user-grid">
        {filtered.map((u) => (
          <button key={u.id} className="user-card user-card--with-avatar" onClick={() => openView(u)}>
            <div className="user-card-avatar">
              <Avatar className="avatar" src={u.profilePhotoUrl} />
            </div>
            <div className="user-card-body">
              <div className="user-card-name">{u.displayName || u.email}</div>
              <div className="user-card-meta">
                <span className="pill pill--compact mono pill--neutral">{u.role}</span>
                {!u.isActive ? (
                  <span className="pill pill--compact mono" style={{ borderColor: 'var(--danger)', background: '#f3dada' }}>
                    inactif
                  </span>
                ) : null}
              </div>
              {u.telephone ? <div className="user-card-sub mono">{u.telephone}</div> : null}
            </div>
          </button>
        ))}
        {!filtered.length ? <div className="mono" style={{ opacity: 0.75 }}>—</div> : null}
      </div>

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>
                {modalMode === 'create' ? 'Nouvel utilisateur' : modalMode === 'edit' ? 'Modifier' : 'Utilisateur'}
              </div>
              <button className="btn" onClick={closeModal}>
                Fermer
              </button>
            </div>

            <div className="modal-body">
              <div className="profile-strip" style={{ marginBottom: 12 }}>
                <div className="avatar-frame" aria-hidden="true">
                  <Avatar className="avatar" src={form.profilePhotoUrl} />
                </div>
                <div className="profile-meta">
                  <div className="profile-name">{form.displayName || form.email || 'Utilisateur'}</div>
                  <div className="profile-line">
                    <span className="pill mono">{form.role || '—'}</span>
                    {!form.isActive ? (
                      <span className="pill mono" style={{ borderColor: 'var(--danger)', background: '#f3dada' }}>
                        inactif
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {modalMode === 'view' ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="mono" style={{ opacity: 0.9 }}>{form.email}</div>
                  <div className="row">
                    <button className="btn primary" onClick={openEdit} disabled={busy}>
                      Modifier
                    </button>
                    {selected ? (
                      <button className="btn danger" onClick={() => void doDelete(selected)} disabled={busy}>
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="grid">
                  <div className="field">
                    <div className="label">Prénom</div>
                    <input
                      className="input"
                      value={(form as any).prenom ?? ''}
                      onChange={(e) => {
                        const prenom = e.target.value
                        setForm((v: any) => {
                          const next = { ...v, prenom }
                          next.displayName = `${String(next.prenom || '').trim()} ${String(next.nom || '').trim()}`.trim()
                          return next
                        })
                      }}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Nom</div>
                    <input
                      className="input"
                      value={(form as any).nom ?? ''}
                      onChange={(e) => {
                        const nom = e.target.value
                        setForm((v: any) => {
                          const next = { ...v, nom }
                          next.displayName = `${String(next.prenom || '').trim()} ${String(next.nom || '').trim()}`.trim()
                          return next
                        })
                      }}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Email</div>
                    <input className="input mono" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} />
                  </div>
                  <div className="field">
                    <div className="label">Téléphone</div>
                    <input className="input mono" value={form.telephone} onChange={(e) => setForm((v) => ({ ...v, telephone: e.target.value }))} />
                  </div>
                  <div className="field">
                    <div className="label">Rôle</div>
                    <select
                      className="input mono"
                      value={form.role}
                      onChange={(e) => setForm((v) => ({ ...v, role: e.target.value }))}
                      disabled={busy}
                    >
                      <option value="" disabled>
                        — Choisir —
                      </option>
                      {roles
                        .filter((r) => r && r.active)
                        .map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.code} — {r.label}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">Adresse</div>
                    <input className="input" value={form.address} onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} />
                  </div>
                  <div className="field">
                    <div className="label">NIF</div>
                    <input className="input mono" value={form.nif} onChange={(e) => setForm((v) => ({ ...v, nif: e.target.value }))} />
                  </div>
                  <div className="field">
                    <div className="label">NIN</div>
                    <input className="input mono" value={form.nin} onChange={(e) => setForm((v) => ({ ...v, nin: e.target.value }))} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">Photo</div>
                    <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="row" style={{ gap: 10 }}>
                        <input
                          type="file"
                          accept="image/*"
                          className="input"
                          disabled={busy || photoBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            void uploadPickedPhotoToS3(f)
                            // allow re-pick same file
                            e.currentTarget.value = ''
                          }}
                          style={{ padding: 8 }}
                        />
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setForm((v) => ({ ...v, profilePhotoUrl: '' }))
                            setPhotoErr(null)
                            if (localPhotoPreview) URL.revokeObjectURL(localPhotoPreview)
                            setLocalPhotoPreview(null)
                          }}
                          disabled={busy || photoBusy}
                        >
                          Retirer
                        </button>
                      </div>
                      <div className="mono" style={{ opacity: 0.8 }}>
                        {photoBusy ? 'Upload…' : form.profilePhotoUrl ? 'OK' : '—'}
                      </div>
                    </div>
                    {photoErr ? (
                      <div className="mono" style={{ marginTop: 8, color: 'var(--danger)' }}>
                        {photoErr}
                      </div>
                    ) : null}
                    <div className="row" style={{ marginTop: 8 }}>
                      <input
                        className="input mono"
                        value={form.profilePhotoUrl}
                        onChange={(e) => setForm((v) => ({ ...v, profilePhotoUrl: e.target.value }))}
                        placeholder="URL publique de la photo (S3)"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <div className="label">Actif</div>
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))} />
                      <span className="mono">Oui</span>
                    </label>
                  </div>
                  {modalMode === 'create' ? (
                    <>
                      <div className="field">
                        <div className="label">Mot de passe</div>
                        <div className="row" style={{ gap: 10 }}>
                          <input
                            type={showPw ? 'text' : 'password'}
                            className="input mono"
                            value={form.password}
                            onChange={(e) => setForm((v: any) => ({ ...v, password: e.target.value }))}
                            placeholder="Minimum 8 caractères"
                          />
                          <button className="btn" type="button" onClick={() => setShowPw((v) => !v)}>
                            {showPw ? 'Masquer' : 'Voir'}
                          </button>
                        </div>
                      </div>
                      <div className="field">
                        <div className="label">Confirmer</div>
                        <div className="row" style={{ gap: 10 }}>
                          <input
                            type={showPw2 ? 'text' : 'password'}
                            className="input mono"
                            value={(form as any).passwordConfirm ?? ''}
                            onChange={(e) => setForm((v: any) => ({ ...v, passwordConfirm: e.target.value }))}
                            placeholder="Répète le mot de passe"
                          />
                          <button className="btn" type="button" onClick={() => setShowPw2((v) => !v)}>
                            {showPw2 ? 'Masquer' : 'Voir'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : modalMode === 'edit' && canEditPassword ? (
                    <>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <div className="label">Nouveau mot de passe (optionnel)</div>
                        <div className="row" style={{ gap: 10 }}>
                          <input
                            type={showPw ? 'text' : 'password'}
                            className="input mono"
                            value={form.password}
                            onChange={(e) => setForm((v: any) => ({ ...v, password: e.target.value }))}
                            placeholder="Minimum 8 caractères"
                          />
                          <button className="btn" type="button" onClick={() => setShowPw((v) => !v)}>
                            {showPw ? 'Masquer' : 'Voir'}
                          </button>
                        </div>
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <div className="label">Confirmer le nouveau mot de passe</div>
                        <div className="row" style={{ gap: 10 }}>
                          <input
                            type={showPw2 ? 'text' : 'password'}
                            className="input mono"
                            value={(form as any).passwordConfirm ?? ''}
                            onChange={(e) => setForm((v: any) => ({ ...v, passwordConfirm: e.target.value }))}
                            placeholder="Répète le mot de passe"
                          />
                          <button className="btn" type="button" onClick={() => setShowPw2((v) => !v)}>
                            {showPw2 ? 'Masquer' : 'Voir'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {modalMode !== 'view' ? (
              <div className="modal-footer">
                <button className="btn" onClick={closeModal} disabled={busy}>
                  Annuler
                </button>
                <button className="btn primary" onClick={() => void save()} disabled={busy}>
                  Enregistrer
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AdministrationMarchesPage() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [items, setItems] = useState<RefItem[]>([])
  const [q, setQ] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<{ id: string; nom: string; isActive: boolean }>({ id: '', nom: '', isActive: true })

  const load = async () => {
    setErr(null)
    setBusy(true)
    try {
      const r = await apiFetch<any>('/admin/marches')
      setItems(normalizeRefs(r))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((m) => (m.nom ?? '').toLowerCase().includes(s))
  }, [items, q])

  const openCreate = () => {
    setForm({ id: '', nom: '', isActive: true })
    setModalMode('create')
    setModalOpen(true)
  }

  const openEdit = (m: RefItem) => {
    setForm({ id: m.id, nom: m.nom ?? '', isActive: !!m.isActive })
    setModalMode('edit')
    setModalOpen(true)
  }

  const closeModal = () => setModalOpen(false)

  const save = async () => {
    setErr(null)
    setBusy(true)
    try {
      const payload: any = { nom: form.nom.trim() }
      if (modalMode === 'create') {
        await apiFetch('/admin/marches', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        payload.isActive = !!form.isActive
        await apiFetch(`/admin/marches/${encodeURIComponent(form.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      await load()
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (m: RefItem) => {
    if (!window.confirm(`Supprimer (désactiver) le marché "${m.nom}" ?`)) return
    setErr(null)
    setBusy(true)
    try {
      await apiFetch(`/admin/marches/${encodeURIComponent(m.id)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>Administration • Marchés</div>
        <div className="row">
          <input className="input mono" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" style={{ width: 240 }} />
          <button className="btn" onClick={load} disabled={busy}>Actualiser</button>
          <button className="btn primary" onClick={openCreate} disabled={busy}>Nouveau</button>
        </div>
      </div>

      {err ? <div style={{ marginBottom: 12 }}><ErrorBox err={err} /></div> : null}

      <div className="user-grid">
        {filtered.map((m) => (
          <button key={m.id} className="user-card" onClick={() => openEdit(m)}>
            <div className="user-card-body">
              <div className="user-card-kicker">Marché</div>
              <div className="user-card-heading">{m.nom}</div>
              <div className="user-card-meta">
                {!m.isActive ? (
                  <span className="pill pill--compact mono" style={{ borderColor: 'var(--danger)', background: '#f3dada' }}>
                    inactif
                  </span>
                ) : (
                  <span className="pill pill--compact mono pill--neutral">actif</span>
                )}
              </div>
            </div>
          </button>
        ))}
        {!filtered.length ? <div className="mono" style={{ opacity: 0.75 }}>—</div> : null}
      </div>

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>{modalMode === 'create' ? 'Nouveau marché' : 'Modifier le marché'}</div>
              <button className="btn" onClick={closeModal}>Fermer</button>
            </div>
            <div className="modal-body">
              <div className="grid">
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Nom</div>
                  <input className="input" value={form.nom} onChange={(e) => setForm((v) => ({ ...v, nom: e.target.value }))} />
                </div>
                {modalMode === 'edit' ? (
                  <div className="field">
                    <div className="label">Actif</div>
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))} />
                      <span className="mono">Oui</span>
                    </label>
                  </div>
                ) : null}
                {modalMode === 'edit' ? (
                  <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn danger" onClick={() => void remove({ id: form.id, nom: form.nom, isActive: form.isActive })} disabled={busy}>
                      Supprimer
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={closeModal} disabled={busy}>Annuler</button>
              <button className="btn primary" onClick={() => void save()} disabled={busy}>Enregistrer</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AdministrationCimetieresPage() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [items, setItems] = useState<RefItem[]>([])
  const [q, setQ] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<{ id: string; nom: string; isActive: boolean }>({ id: '', nom: '', isActive: true })

  const load = async () => {
    setErr(null)
    setBusy(true)
    try {
      const r = await apiFetch<any>('/admin/cimetieres')
      setItems(normalizeRefs(r))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((m) => (m.nom ?? '').toLowerCase().includes(s))
  }, [items, q])

  const openCreate = () => {
    setForm({ id: '', nom: '', isActive: true })
    setModalMode('create')
    setModalOpen(true)
  }

  const openEdit = (m: RefItem) => {
    setForm({ id: m.id, nom: m.nom ?? '', isActive: !!m.isActive })
    setModalMode('edit')
    setModalOpen(true)
  }

  const closeModal = () => setModalOpen(false)

  const save = async () => {
    setErr(null)
    setBusy(true)
    try {
      const payload: any = { nom: form.nom.trim() }
      if (modalMode === 'create') {
        await apiFetch('/admin/cimetieres', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        payload.isActive = !!form.isActive
        await apiFetch(`/admin/cimetieres/${encodeURIComponent(form.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      await load()
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (m: RefItem) => {
    if (!window.confirm(`Supprimer (désactiver) le cimetière "${m.nom}" ?`)) return
    setErr(null)
    setBusy(true)
    try {
      await apiFetch(`/admin/cimetieres/${encodeURIComponent(m.id)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>Administration • Cimetières</div>
        <div className="row">
          <input className="input mono" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" style={{ width: 240 }} />
          <button className="btn" onClick={load} disabled={busy}>Actualiser</button>
          <button className="btn primary" onClick={openCreate} disabled={busy}>Nouveau</button>
        </div>
      </div>

      {err ? <div style={{ marginBottom: 12 }}><ErrorBox err={err} /></div> : null}

      <div className="user-grid">
        {filtered.map((m) => (
          <button key={m.id} className="user-card" onClick={() => openEdit(m)}>
            <div className="user-card-body">
              <div className="user-card-kicker">Cimetière</div>
              <div className="user-card-heading">{m.nom}</div>
              <div className="user-card-meta">
                {!m.isActive ? (
                  <span className="pill pill--compact mono" style={{ borderColor: 'var(--danger)', background: '#f3dada' }}>
                    inactif
                  </span>
                ) : (
                  <span className="pill pill--compact mono pill--neutral">actif</span>
                )}
              </div>
            </div>
          </button>
        ))}
        {!filtered.length ? <div className="mono" style={{ opacity: 0.75 }}>—</div> : null}
      </div>

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>{modalMode === 'create' ? 'Nouveau cimetière' : 'Modifier le cimetière'}</div>
              <button className="btn" onClick={closeModal}>Fermer</button>
            </div>
            <div className="modal-body">
              <div className="grid">
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Nom</div>
                  <input className="input" value={form.nom} onChange={(e) => setForm((v) => ({ ...v, nom: e.target.value }))} />
                </div>
                {modalMode === 'edit' ? (
                  <div className="field">
                    <div className="label">Actif</div>
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))} />
                      <span className="mono">Oui</span>
                    </label>
                  </div>
                ) : null}
                {modalMode === 'edit' ? (
                  <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn danger" onClick={() => void remove({ id: form.id, nom: form.nom, isActive: form.isActive })} disabled={busy}>
                      Supprimer
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={closeModal} disabled={busy}>Annuler</button>
              <button className="btn primary" onClick={() => void save()} disabled={busy}>Enregistrer</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type RecKind =
  | 'ENTREPRISE'
  | 'ORGANISATION'
  | 'COMMERCANT'
  | 'LOGEMENT'
  | 'ECOLE'
  | 'EGLISE'
  | 'CIMETIERE'
  | 'JEUX_HASARD'
  | 'DOMAINE_ETAT'

type RecModuleId = RecKind | 'PROJET_CONSTRUCTION'

const RECENSEMENT_MODULES: Array<{ id: RecModuleId; label: string; desc: string }> = [
  { id: 'PROJET_CONSTRUCTION', label: 'Projets de construction', desc: 'Permis, travaux, surfaces, suivi.' },
  { id: 'DOMAINE_ETAT', label: 'Domaine de l’État', desc: 'Parcelles ou bâtiments du domaine privé de l’État.' },
  { id: 'ENTREPRISE', label: 'Entreprises', desc: 'Établissements, entreprises.' },
  { id: 'ORGANISATION', label: 'Organisations', desc: 'Organisations / institutions (séparé des entreprises).' },
  { id: 'COMMERCANT', label: 'Petits commerçants', desc: 'Commerçants / marchands, marché, vente.' },
  { id: 'LOGEMENT', label: 'Propriétés bâties', desc: 'Logements, immeubles, occupation, matériaux.' },
  { id: 'ECOLE', label: 'Écoles', desc: 'Bâtiments scolaires, salles, élèves.' },
  { id: 'EGLISE', label: 'Églises', desc: 'Bâtiments religieux, salles, membres.' },
  { id: 'CIMETIERE', label: 'Cimetières (recensement)', desc: 'Sépulture: type, places, surface.' },
  { id: 'JEUX_HASARD', label: 'Jeux de hasard', desc: 'Borlette, pariage, combat de coq.' },
]

type RecPhotoRow = { key: string; contentType?: string; createdAt?: string }

const REC_ENTITY_PHOTOS_MAX = 12

function recModuleUsesPhotos(id: RecModuleId): boolean {
  return (
    id === 'ENTREPRISE' ||
    id === 'LOGEMENT' ||
    id === 'ECOLE' ||
    id === 'EGLISE' ||
    id === 'CIMETIERE' ||
    id === 'JEUX_HASARD' ||
    id === 'ORGANISATION' ||
    id === 'DOMAINE_ETAT'
  )
}

function recModuleUsesGps(id: RecModuleId): boolean {
  return (
    id === 'ENTREPRISE' ||
    id === 'COMMERCANT' ||
    id === 'LOGEMENT' ||
    id === 'ECOLE' ||
    id === 'EGLISE' ||
    id === 'JEUX_HASARD' ||
    id === 'CIMETIERE' ||
    id === 'DOMAINE_ETAT'
  )
}

function s3FolderForRecModule(id: RecModuleId): string {
  switch (id) {
    case 'DOMAINE_ETAT':
      return 'domaine-etat'
    case 'ENTREPRISE':
      return 'entreprises'
    case 'LOGEMENT':
      return 'logements'
    case 'ECOLE':
      return 'ecoles'
    case 'EGLISE':
      return 'eglises'
    case 'CIMETIERE':
      return 'cimetiere'
    case 'JEUX_HASARD':
      return 'jeux-hasard'
    case 'ORGANISATION':
      return 'organisations'
    default:
      return 'misc'
  }
}

function normalizeRecPhotos(raw: unknown): RecPhotoRow[] {
  if (!Array.isArray(raw)) return []
  const out: RecPhotoRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const key = String(o.key ?? '').trim()
    if (!key) continue
    const r: RecPhotoRow = { key }
    if (o.contentType != null && String(o.contentType).trim()) r.contentType = String(o.contentType)
    if (o.createdAt != null && String(o.createdAt).trim()) r.createdAt = String(o.createdAt)
    out.push(r)
  }
  return out
}

async function uploadRecensementImageFile(folder: string, file: File): Promise<RecPhotoRow> {
  const { bytes, contentType, extension, localPreviewUrl } = await compressImageToWebpOrJpeg(file)
  URL.revokeObjectURL(localPreviewUrl)
  const presign = await apiFetch<{
    key: string
    uploadUrl: string
    headers: Record<string, string>
  }>('/uploads/s3/presign-upload', {
    method: 'POST',
    body: JSON.stringify({ contentType, extension, folder }),
  })
  await putBinary(presign.uploadUrl, bytes, presign.headers)
  return { key: presign.key, contentType, createdAt: new Date().toISOString() }
}

function RecensementPhotoPicker({
  label,
  folder,
  photos,
  max,
  disabled,
  orgLogo,
  onChange,
  onError,
}: {
  label: string
  folder: string
  photos: RecPhotoRow[]
  max: number
  disabled?: boolean
  orgLogo?: boolean
  onChange: (next: RecPhotoRow[]) => void
  onError?: (msg: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = () => inputRef.current?.click()
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const room = Math.max(0, max - photos.length)
    const slice = Array.from(files).slice(0, room)
    e.target.value = ''
    if (!slice.length) return
    setBusy(true)
    try {
      const next = [...photos]
      for (const f of slice) {
        next.push(await uploadRecensementImageFile(folder, f))
      }
      onChange(next)
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err))
      try {
        await apiFetch('/uploads/s3/upload-trace', {
          method: 'POST',
          body: JSON.stringify({
            stage: 'recensement_photo',
            message: err instanceof Error ? err.message : String(err),
            platform: 'electron-renderer',
          }),
        })
      } catch {
        // ignore
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <div className="label">{label}</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={!orgLogo}
          style={{ display: 'none' }}
          onChange={(e) => void onFiles(e)}
        />
        <button type="button" className="btn" onClick={pick} disabled={disabled || busy || photos.length >= max}>
          {busy ? 'Envoi…' : orgLogo ? 'Choisir un logo' : 'Ajouter une photo'}
        </button>
        <span className="mono" style={{ opacity: 0.75, fontSize: 12 }}>
          {photos.length}/{max}
        </span>
      </div>
      {photos.length ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {photos.map((p, i) => (
            <div key={`${p.key}-${i}`} style={{ position: 'relative' }}>
              <S3ObjectImage
                objectKey={p.key}
                alt=""
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
              <button
                type="button"
                className="btn danger"
                style={{ position: 'absolute', top: -6, right: -6, padding: '2px 8px', fontSize: 11 }}
                disabled={disabled || busy}
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RecensementGpsBlock({
  show,
  form,
  setForm,
  disabled,
}: {
  show: boolean
  form: any
  setForm: React.Dispatch<React.SetStateAction<any>>
  disabled?: boolean
}) {
  if (!show) return null
  const capture = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((v: any) => ({
          ...v,
          gpsLatitude: String(pos.coords.latitude),
          gpsLongitude: String(pos.coords.longitude),
          gpsAccuracy:
            pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
              ? String(Math.round(pos.coords.accuracy))
              : '',
        }))
      },
      () => {},
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <div className="label">GPS</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          className="input mono"
          style={{ width: 140 }}
          placeholder="Latitude"
          value={form.gpsLatitude ?? ''}
          onChange={(e) => setForm((v: any) => ({ ...v, gpsLatitude: e.target.value }))}
          disabled={disabled}
        />
        <input
          className="input mono"
          style={{ width: 140 }}
          placeholder="Longitude"
          value={form.gpsLongitude ?? ''}
          onChange={(e) => setForm((v: any) => ({ ...v, gpsLongitude: e.target.value }))}
          disabled={disabled}
        />
        <input
          className="input mono"
          style={{ width: 100 }}
          placeholder="± m"
          value={form.gpsAccuracy ?? ''}
          onChange={(e) => setForm((v: any) => ({ ...v, gpsAccuracy: e.target.value }))}
          disabled={disabled}
        />
        <button type="button" className="btn" onClick={capture} disabled={disabled}>
          Point GPS
        </button>
      </div>
    </div>
  )
}

type RecEntity = {
  id: string
  kind: RecKind
  denomination: string
  numeroDossier?: string | null
  telephone: string | null
  adresse: string | null
  domaineCategorie?: 'PROPRIETE_BATIE' | 'EMPLACEMENT'
  gpsPoint?: any
  notes?: string | null
  marcheId?: string | null
  cimetiereId?: string | null
  createdAt?: string
  updatedAt?: string
  [k: string]: any
}

const CONSTRUCTION_CATEGORIES_TRAVAIL = [
  'CLOTURE',
  'CONSTRUCTION_BATIMENT',
  'RENOVATION',
  'AJOUT_NIVEAU',
  'FORAGE_PUITS',
  'CITERNE',
  'AUTRE',
] as const

type ConstructionCategorieTravail = (typeof CONSTRUCTION_CATEGORIES_TRAVAIL)[number]

function labelConstructionCategorie(c: ConstructionCategorieTravail | string | null | undefined): string {
  switch (c) {
    case 'CLOTURE':
      return 'Clôture'
    case 'CONSTRUCTION_BATIMENT':
      return 'Construction bâtiment'
    case 'RENOVATION':
      return 'Rénovation'
    case 'AJOUT_NIVEAU':
      return 'Ajout de niveau'
    case 'FORAGE_PUITS':
      return 'Forage puits'
    case 'CITERNE':
      return 'Citerne'
    case 'AUTRE':
      return 'Autre'
    default:
      return ''
  }
}

function labelConstructionStatut(s: string | null | undefined): string {
  switch (s) {
    case 'PREPARATION':
      return 'Préparation'
    case 'EN_COURS':
      return 'En cours'
    case 'TERMINE':
      return 'Terminé'
    case 'ABANDONNE':
      return 'Abandonné'
    default:
      return s ? String(s) : ''
  }
}

function isBuildingSurfaceCategory(c: string | null | undefined): boolean {
  return c === 'CONSTRUCTION_BATIMENT' || c === 'RENOVATION' || c === 'AJOUT_NIVEAU'
}

function isInfraCategory(c: string | null | undefined): boolean {
  return c === 'FORAGE_PUITS' || c === 'CITERNE'
}

type ConstructionProject = {
  id: string
  numeroDossier?: string
  denomination?: string | null
  categorieTravail?: ConstructionCategorieTravail | string | null
  statut: 'PREPARATION' | 'EN_COURS' | 'TERMINE' | 'ABANDONNE'
  telephone: string | null
  proprietaireNom: string | null
  proprietairePrenom: string | null
  proprietaireTelephone: string | null
  proprietaireEmail: string | null
  proprietaireNif: string | null
  natureTravaux: string | null
  superficieTerrainM2: number | null
  superficieAutoriseeConstruireM2: number | null
  clotureMl: number | null
  niveauOuHauteur: string | null
  superficieBatimentDemolirM2: number | null
  nomIngenieurArchitecte: string | null
  dureePermisConstruire: string | null
  adresse: string | null
  gpsPoint: any | null
  photos: any[] | null
  notes: string | null
  surfacePrevueM2: number | null
  linkedLogementEntityId: string | null
  resultLogementEntityId: string | null
  createdAt?: string
  updatedAt?: string
}

function normalizeRecEntities(payload: any): RecEntity[] {
  if (Array.isArray(payload)) return payload as RecEntity[]
  const candidates = [payload?.items, payload?.data, payload?.entities, payload?.results]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as RecEntity[]
  }
  return []
}

function normalizeDomaineEtatBiens(payload: any): RecEntity[] {
  const raw = Array.isArray(payload) ? payload : []
  return raw.map((r: any) => {
    const cat = r?.categorie === 'PROPRIETE_BATIE' || r?.categorie === 'EMPLACEMENT' ? r.categorie : 'EMPLACEMENT'
    return {
      id: String(r.id),
      kind: 'DOMAINE_ETAT',
      numeroDossier: r?.numeroDossier ?? r?.numero_dossier ?? null,
      domaineCategorie: cat,
      denomination: String(r.designation ?? ''),
      telephone: null,
      adresse: r.adresse ?? null,
      gpsPoint: r.gpsPoint ?? null,
      notes: r.notes ?? null,
      photos: r.photos ?? null,
      parcelleSurfaceM2: r.parcelleSurfaceM2,
      superficieTerrainM2: r.superficieTerrainM2,
      superficieConstruiteM2: r.superficieConstruiteM2,
      niveauxNombre: r.niveauxNombre,
      anneeConstruction: r.anneeConstruction,
      usageBatiment: r.usageBatiment,
    } as RecEntity
  })
}

function normalizeConstructionProjects(payload: any): ConstructionProject[] {
  if (Array.isArray(payload)) return payload as ConstructionProject[]
  const candidates = [payload?.items, payload?.data, payload?.projects, payload?.results]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as ConstructionProject[]
  }
  return []
}

function mergeConstructionWorksDescription(p: ConstructionProject): string {
  const n = (p.natureTravaux ?? '').trim()
  const d = (p.denomination ?? '').trim()
  if (!n) return d
  if (!d) return n
  if (n === d || n.includes(d) || d.includes(n)) return n
  return `${n}\n\n${d}`
}

function constructionProjectListTitle(p: ConstructionProject): string {
  const num = (p.numeroDossier ?? '').trim()
  if (num) return num
  const works = mergeConstructionWorksDescription(p)
  if (works) return works.length > 56 ? works.slice(0, 56) + '…' : works
  const nom = (p.proprietaireNom ?? '').trim()
  if (nom) return nom
  return `Projet ${p.id.slice(0, 8)}…`
}

function normConstructionPayloadString(v: unknown): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t.length ? t : null
}

function parseOptionalPositiveNumber(raw: unknown): number | null | 'invalid' {
  const t = String(raw ?? '').trim()
  if (!t.length) return null
  const n = Number(t.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return 'invalid'
  return n
}

function RecensementPage({
  canWrite,
  allowedModules,
}: {
  canWrite: boolean
  allowedModules: RecensementModuleId[] | null
}) {
  const visibleModules = useMemo(
    () => filterRecensementModules(RECENSEMENT_MODULES, allowedModules),
    [allowedModules],
  )
  const [moduleId, setModuleId] = useState<RecModuleId>(() => visibleModules[0]?.id ?? 'PROJET_CONSTRUCTION')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [items, setItems] = useState<RecEntity[]>([])
  const [q, setQ] = useState('')
  const [qProjects, setQProjects] = useState('')

  const [marches, setMarches] = useState<RefItem[]>([])
  const [cimetieres, setCimetieres] = useState<RefItem[]>([])

  const [projectsNewTick, setProjectsNewTick] = useState(0)
  const [projectsRefreshTick, setProjectsRefreshTick] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selected, setSelected] = useState<RecEntity | null>(null)
  const [form, setForm] = useState<any>(() => ({ kind: moduleId, denomination: '' }))
  const [viewOpen, setViewOpen] = useState(false)
  const [viewItem, setViewItem] = useState<RecEntity | null>(null)
  const [projectListStats, setProjectListStats] = useState({ total: 0, filtered: 0, busy: false })

  useEffect(() => {
    if (!visibleModules.some((m) => m.id === moduleId)) {
      setModuleId(visibleModules[0]?.id ?? 'PROJET_CONSTRUCTION')
    }
  }, [visibleModules, moduleId])


  const load = async (kind = moduleId) => {
    setErr(null)
    setBusy(true)
    try {
      if (kind === 'PROJET_CONSTRUCTION') {
        setItems([])
        return
      }

      if (kind === 'DOMAINE_ETAT') {
        const entitiesRes = await apiFetch<any>('/recensement/domaine-etat-biens')
        setItems(sortByCreatedAtDesc(normalizeDomaineEtatBiens(entitiesRes)))
        return
      }

      const apiKind = kind === 'ORGANISATION' ? 'ORGANISATION' : kind
      const needsMarches = kind === 'COMMERCANT'
      const needsCimetieres = kind === 'CIMETIERE'
      const jobs: Promise<unknown>[] = [apiFetch<any>(`/recensement/entities?kind=${encodeURIComponent(apiKind)}`)]
      if (needsMarches) jobs.push(apiFetch<any>('/marches'))
      if (needsCimetieres) jobs.push(apiFetch<any>('/cimetieres'))

      const results = await Promise.all(jobs)
      const entitiesRes = results[0]
      setItems(sortByCreatedAtDesc(normalizeRecEntities(entitiesRes)))
      if (needsMarches) setMarches(normalizeRefs(results[1]))
      if (needsCimetieres) setCimetieres(normalizeRefs(results[needsMarches ? 2 : 1]))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(moduleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = sortByCreatedAtDesc(items)
    if (!s) return base
    return base.filter((it) => {
      const t = `${it.denomination ?? ''} ${it.telephone ?? ''} ${it.adresse ?? ''} ${it.numeroDossier ?? ''}`
        .toLowerCase()
      return t.includes(s)
    })
  }, [items, q])

  const openCreate = () => {
    if (moduleId === 'PROJET_CONSTRUCTION') {
      setProjectsNewTick((v) => v + 1)
      return
    }
    if (moduleId === 'DOMAINE_ETAT') {
      setSelected(null)
      setModalMode('create')
      setForm({
        domaineCategorie: 'EMPLACEMENT',
        designation: '',
        adresse: '',
        notes: '',
        photos: [],
        gpsLatitude: '',
        gpsLongitude: '',
        gpsAccuracy: '',
        parcelleSurfaceM2: '',
        superficieTerrainM2: '',
        superficieConstruiteM2: '',
        niveauxNombre: '',
        anneeConstruction: '',
        usageBatiment: '',
      })
      setModalOpen(true)
      return
    }
    setSelected(null)
    setModalMode('create')
    setForm({
      kind: moduleId,
      denomination: '',
      telephone: '',
      email: '',
      // Entreprise: aligner avec le formulaire mobile (CIN/NIF + champs entreprise)
      ...(moduleId === 'ENTREPRISE'
        ? {
            cin: '',
            nif: '',
            activiteDomaine: '',
            affichageType: '',
            qtyBillboard: '',
            qtyEnseigne: '',
            qtyFresque: '',
            categoryTier: '',
          }
        : {}),
      // Organisation: aligner avec le formulaire mobile (CIN/NIF + champs organisation)
      ...(moduleId === 'ORGANISATION'
        ? {
            cin: '',
            nif: '',
            activiteDomaine: '',
            orgSigle: '',
            orgReconnueMasse: false,
            orgReconnueMairie: false,
            orgDateFondation: '',
            proprietaireNom: '',
            proprietairePrenom: '',
            proprietaireTelephone: '',
            proprietaireEmail: '',
            proprietaireCin: '',
            proprietaireNif: '',
          }
        : {}),
      // Petit commerçant: aligner avec le formulaire mobile
      ...(moduleId === 'COMMERCANT'
        ? {
            cin: '',
            nif: '',
            commercantNom: '',
            commercantPrenom: '',
            marchandiseType: '',
            venteType: 'DETAIL',
            dispositionMarchandise: 'AU_SOL',
            marcheId: '',
          }
        : {}),
      // Cimetière: aligner avec le formulaire mobile
      ...(moduleId === 'CIMETIERE'
        ? {
            cimetiereId: '',
            sepultureType: 'CAVEAU',
            sepulturePlaces: '',
            sepultureSurfaceM2: '',
            proprietaireNom: '',
            proprietairePrenom: '',
            proprietaireTelephone: '',
            proprietaireEmail: '',
            proprietaireCin: '',
            proprietaireNif: '',
            proprietaireAdresse: '',
          }
        : {}),
      // Jeux d'hasard: aligner avec le formulaire mobile
      ...(moduleId === 'JEUX_HASARD'
        ? {
            jeuxHasardType: 'BORLETTE',
            jeuxHasardEmplacement: 'GUICHET',
            denomination: '',
            categoryTier: '1',
            proprietaireNom: '',
            proprietairePrenom: '',
            proprietaireTelephone: '',
            proprietaireEmail: '',
            proprietaireCin: '',
            proprietaireNif: '',
            proprietaireAdresse: '',
          }
        : {}),
      // Propriété bâtie (LOGEMENT): aligner avec le formulaire mobile
      ...(moduleId === 'LOGEMENT'
        ? {
            anneeConstruction: '',
            logementOccupation: '',
            logementMur: '',
            toilettesNombre: '',
            toilettesNature: '',
            cuisinesNombre: '',
            cuisinesNature: '',
            etagesNombre: '',
            appartementsNombre: '',
            chambresNombre: '',
            garagesNombre: '',
            salonsNombre: '',
            balconsNombre: '',
            plancherNature: '',
            toitureNatures: [] as string[],
            surfaceM2: '',
            immeubleUsage: '',
          proprietaireNom: '',
          proprietairePrenom: '',
          proprietaireTelephone: '',
          proprietaireEmail: '',
          proprietaireCin: '',
          proprietaireNif: '',
          proprietaireAdresse: '',
          }
        : {}),
      // École / Église: aligner avec le formulaire mobile
      ...(moduleId === 'ECOLE'
        ? {
            logementMur: '',
            toilettesNombre: '',
            toilettesNature: '',
            cuisinesNombre: '',
            cuisinesNature: '',
            chambresNombre: '',
            elevesNombre: '',
            superficieTerrainM2: '',
            superficieConstruiteM2: '',
            niveauxNombre: '',
            constructionType: '',
            constructionTypePrecise: '',
            sallesNombre: '',
            sallesSuperficieM2: '',
            proprietaireNom: '',
            proprietairePrenom: '',
            proprietaireTelephone: '',
            proprietaireEmail: '',
            proprietaireCin: '',
            proprietaireNif: '',
            proprietaireAdresse: '',
          }
        : {}),
      ...(moduleId === 'EGLISE'
        ? {
            logementMur: '',
            toilettesNombre: '',
            toilettesNature: '',
            cuisinesNombre: '',
            cuisinesNature: '',
            chambresNombre: '',
            membresNombre: '',
            categoryTier: '1',
            proprietaireNom: '',
            proprietairePrenom: '',
            proprietaireTelephone: '',
            proprietaireEmail: '',
            proprietaireCin: '',
            proprietaireNif: '',
            proprietaireAdresse: '',
          }
        : {}),
      adresse: '',
      notes: '',
      photos: [],
      gpsLatitude: '',
      gpsLongitude: '',
      gpsAccuracy: '',
    })
    setModalOpen(true)
  }

  const openView = (it: RecEntity) => {
    setViewItem(it)
    setViewOpen(true)
  }

  const closeView = () => {
    setViewOpen(false)
    setViewItem(null)
  }

  const openEdit = (it: RecEntity) => {
    closeView()
    setSelected(it)
    setModalMode('edit')
    if (it.kind === 'DOMAINE_ETAT') {
      const x = it as RecEntity & Record<string, unknown>
      setForm({
        domaineCategorie: it.domaineCategorie ?? 'EMPLACEMENT',
        designation: it.denomination ?? '',
        adresse: it.adresse ?? '',
        notes: it.notes ?? '',
        photos: normalizeRecPhotos(it.photos),
        gpsLatitude: it.gpsPoint?.latitude != null ? String(it.gpsPoint.latitude) : '',
        gpsLongitude: it.gpsPoint?.longitude != null ? String(it.gpsPoint.longitude) : '',
        gpsAccuracy:
          it.gpsPoint?.accuracy != null && Number.isFinite(Number(it.gpsPoint.accuracy))
            ? String(it.gpsPoint.accuracy)
            : '',
        parcelleSurfaceM2:
          x.parcelleSurfaceM2 != null && x.parcelleSurfaceM2 !== '' ? String(x.parcelleSurfaceM2) : '',
        superficieTerrainM2:
          x.superficieTerrainM2 != null && x.superficieTerrainM2 !== ''
            ? String(x.superficieTerrainM2)
            : '',
        superficieConstruiteM2:
          x.superficieConstruiteM2 != null && x.superficieConstruiteM2 !== ''
            ? String(x.superficieConstruiteM2)
            : '',
        niveauxNombre: x.niveauxNombre != null && x.niveauxNombre !== '' ? String(x.niveauxNombre) : '',
        anneeConstruction:
          x.anneeConstruction != null && x.anneeConstruction !== '' ? String(x.anneeConstruction) : '',
        usageBatiment: x.usageBatiment != null ? String(x.usageBatiment) : '',
      })
      setModalOpen(true)
      return
    }
    setForm({
      ...it,
      telephone: it.telephone ?? '',
      adresse: it.adresse ?? '',
      notes: it.notes ?? '',
      photos: normalizeRecPhotos(it.photos),
      gpsLatitude: it.gpsPoint?.latitude != null ? String(it.gpsPoint.latitude) : '',
      gpsLongitude: it.gpsPoint?.longitude != null ? String(it.gpsPoint.longitude) : '',
      gpsAccuracy:
        it.gpsPoint?.accuracy != null && Number.isFinite(Number(it.gpsPoint.accuracy))
          ? String(it.gpsPoint.accuracy)
          : '',
    })
    setModalOpen(true)
  }

  const closeModal = () => setModalOpen(false)

  const cleanPayload = (raw: any) => {
    const out: any = {}
    for (const [k, v] of Object.entries(raw ?? {})) {
      if (v === undefined) continue
      if (typeof v === 'string') {
        const t = v.trim()
        if (!t) continue
        out[k] = t
        continue
      }
      out[k] = v
    }
    return out
  }

  const save = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (moduleId === 'PROJET_CONSTRUCTION') return

      if (moduleId === 'DOMAINE_ETAT') {
        const cat = form.domaineCategorie === 'PROPRIETE_BATIE' ? 'PROPRIETE_BATIE' : 'EMPLACEMENT'
        const designation = String(form.designation ?? '').trim()
        if (!designation) throw new Error('Désignation requise.')
        const payload: any = {
          categorie: cat,
          designation,
          adresse: String(form.adresse ?? '').trim() || null,
          notes: String(form.notes ?? '').trim() || null,
        }
        const la = Number(String(form.gpsLatitude ?? '').trim().replace(',', '.'))
        const lo = Number(String(form.gpsLongitude ?? '').trim().replace(',', '.'))
        const accRaw = String(form.gpsAccuracy ?? '').trim().replace(',', '.')
        const acc = accRaw ? Number(accRaw) : NaN
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          payload.gpsPoint = {
            latitude: la,
            longitude: lo,
            recordedAt: new Date().toISOString(),
          }
          if (Number.isFinite(acc) && acc >= 0) {
            payload.gpsPoint.accuracy = acc
          }
        } else {
          payload.gpsPoint = null
        }
        const plist = Array.isArray(form.photos)
          ? (form.photos as RecPhotoRow[]).filter((p) => typeof p?.key === 'string' && p.key.trim().length)
          : []
        payload.photos = plist.length ? plist : null
        if (cat === 'EMPLACEMENT') {
          const s = Number(String(form.parcelleSurfaceM2 ?? '').trim().replace(',', '.'))
          if (!Number.isFinite(s) || s <= 0) throw new Error('Surface de la parcelle (m²) requise.')
          payload.parcelleSurfaceM2 = s
        } else {
          const sc = Number(String(form.superficieConstruiteM2 ?? '').trim().replace(',', '.'))
          if (!Number.isFinite(sc) || sc <= 0) throw new Error('Superficie construite (m²) requise.')
          payload.superficieConstruiteM2 = sc
          const st = Number(String(form.superficieTerrainM2 ?? '').trim().replace(',', '.'))
          if (Number.isFinite(st) && st > 0) payload.superficieTerrainM2 = st
          const n = Number(String(form.niveauxNombre ?? '').trim().replace(',', '.'))
          if (Number.isFinite(n) && n >= 0) payload.niveauxNombre = Math.floor(n)
          const ac = Number(String(form.anneeConstruction ?? '').trim())
          if (Number.isFinite(ac) && ac >= 1700 && ac <= 2200) payload.anneeConstruction = Math.floor(ac)
          const ub = String(form.usageBatiment ?? '').trim()
          if (ub) payload.usageBatiment = ub
        }
        if (modalMode === 'create') {
          await apiFetch('/recensement/domaine-etat-biens', { method: 'POST', body: JSON.stringify(payload) })
        } else {
          if (!selected?.id) throw new Error('ID manquant')
          await apiFetch(`/recensement/domaine-etat-biens/${encodeURIComponent(selected.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        }
        await load(moduleId)
        closeModal()
        return
      }

      const payload = cleanPayload({ ...form, kind: moduleId })
      if (moduleId === 'LOGEMENT') {
        const pn = String(payload.proprietaireNom ?? '').trim()
        const pp = String(payload.proprietairePrenom ?? '').trim()
        const full = [pp, pn].filter(Boolean).join(' ').trim()
        payload.denomination = full ? `Propriété bâtie — ${full}` : 'Propriété bâtie'
      } else if (moduleId === 'CIMETIERE') {
        const st = String(payload.sepultureType ?? '').trim()
        const type = st === 'CAVEAU' ? 'Caveau' : st === 'CERCA' ? 'Cerca' : 'Sépulture'
        payload.denomination = `Cimetière — ${type}`
      } else {
        if (!payload.denomination) throw new Error('Dénomination requise.')
      }

      delete payload.id
      delete payload.gpsLatitude
      delete payload.gpsLongitude
      delete payload.gpsAccuracy

      // Alignement app: "Assainissement" requis pour les modules concernés.
      if (
        moduleId === 'ENTREPRISE' ||
        moduleId === 'COMMERCANT' ||
        moduleId === 'LOGEMENT' ||
        moduleId === 'ECOLE' ||
        moduleId === 'EGLISE' ||
        moduleId === 'JEUX_HASARD'
      ) {
        const tier = Number(String(payload.categoryTier ?? '').trim())
        if (![1, 2, 3].includes(tier)) {
          throw new Error('Assainissement requis (1, 2 ou 3).')
        }
        payload.categoryTier = tier
      }

      // Alignement app: jeux d'hasard → type + emplacement obligatoires.
      if (moduleId === 'JEUX_HASARD') {
        const t = String(payload.jeuxHasardType ?? '').trim()
        const e = String(payload.jeuxHasardEmplacement ?? '').trim()
        if (!t) throw new Error('Type d’établissement requis.')
        if (!e) throw new Error('Type d’emplacement requis.')
      }

      if (recModuleUsesGps(moduleId)) {
        const la = Number(String(form.gpsLatitude ?? '').trim().replace(',', '.'))
        const lo = Number(String(form.gpsLongitude ?? '').trim().replace(',', '.'))
        const accRaw = String(form.gpsAccuracy ?? '').trim().replace(',', '.')
        const acc = accRaw ? Number(accRaw) : NaN
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          payload.gpsPoint = {
            latitude: la,
            longitude: lo,
            recordedAt: new Date().toISOString(),
          } as any
          if (Number.isFinite(acc) && acc >= 0) {
            ;(payload.gpsPoint as any).accuracy = acc
          }
        } else {
          payload.gpsPoint = null
        }
      } else {
        delete payload.gpsPoint
      }

      // (Keep telephone/cin/nif if user filled them; backend accepts these columns for all kinds.)

      if (recModuleUsesPhotos(moduleId)) {
        const list = Array.isArray(form.photos)
          ? (form.photos as RecPhotoRow[]).filter((p) => typeof p?.key === 'string' && p.key.trim().length)
          : []
        payload.photos = list.length ? list : null
      } else {
        delete payload.photos
      }

      if (payload.marcheId === '—' || payload.marcheId === '') delete payload.marcheId
      if (payload.cimetiereId === '—' || payload.cimetiereId === '') delete payload.cimetiereId

      // numeric fields
      const numKeys = [
        'categoryTier',
        'qtyBillboard',
        'qtyEnseigne',
        'qtyFresque',
        'superficieTerrainM2',
        'superficieConstruiteM2',
        'niveauxNombre',
        'sallesNombre',
        'sallesSuperficieM2',
        'elevesNombre',
        'membresNombre',
        'anneeConstruction',
        'toilettesNombre',
        'cuisinesNombre',
        'etagesNombre',
        'appartementsNombre',
        'chambresNombre',
        'garagesNombre',
        'salonsNombre',
        'balconsNombre',
        'surfaceM2',
        'sepulturePlaces',
        'sepultureSurfaceM2',
      ]
      for (const k of numKeys) {
        if (payload[k] == null || payload[k] === '') continue
        const n = Number(payload[k])
        if (Number.isFinite(n)) payload[k] = n
        else delete payload[k]
      }

      if (modalMode === 'create') {
        await apiFetch('/recensement/entities', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        if (!selected?.id) throw new Error('ID manquant')
        await apiFetch(`/recensement/entities/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      await load(moduleId)
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (it: RecEntity) => {
    if (!window.confirm(`Supprimer "${it.denomination}" ?`)) return
    setErr(null)
    setBusy(true)
    try {
      if (it.kind === 'DOMAINE_ETAT') {
        await apiFetch(`/recensement/domaine-etat-biens/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
      } else {
        await apiFetch(`/recensement/entities/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
      }
      await load(moduleId)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const mod = RECENSEMENT_MODULES.find((m) => m.id === moduleId)!

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="row" style={{ justifyContent: 'space-between', padding: 12, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div>
          <div style={{ fontWeight: 900 }}>Recensement</div>
          <div className="mono" style={{ opacity: 0.8 }}>{mod.label}</div>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <ListToolbarCount
            total={
              moduleId === 'PROJET_CONSTRUCTION' ? projectListStats.total : items.length
            }
            filtered={
              moduleId === 'PROJET_CONSTRUCTION'
                ? qProjects.trim()
                  ? projectListStats.filtered
                  : undefined
                : q.trim()
                  ? filtered.length
                  : undefined
            }
            busy={moduleId === 'PROJET_CONSTRUCTION' ? projectListStats.busy : busy}
          />
          <input
            className="input mono"
            value={moduleId === 'PROJET_CONSTRUCTION' ? qProjects : q}
            onChange={(e) => (moduleId === 'PROJET_CONSTRUCTION' ? setQProjects(e.target.value) : setQ(e.target.value))}
            placeholder="Rechercher…"
            style={{ width: 260 }}
          />
          <button
            className="btn"
            onClick={() => {
              if (moduleId === 'PROJET_CONSTRUCTION') setProjectsRefreshTick((v) => v + 1)
              else void load(moduleId)
            }}
            disabled={busy || projectListStats.busy}
          >
            Actualiser
          </button>
          {canWrite ? (
            <button className="btn primary" onClick={openCreate} disabled={busy}>
              Nouveau
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 520 }}>
        <aside style={{ borderRight: '1px solid rgba(0,0,0,0.08)', padding: 12, background: 'rgba(255,255,255,0.5)' }}>
          <div className="mono" style={{ opacity: 0.8, marginBottom: 10 }}>Modules</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {visibleModules.map((m) => (
              <button
                key={m.id}
                className={`btn ${moduleId === m.id ? 'primary' : ''}`}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setModuleId(m.id)}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800 }}>{m.label}</div>
                  <div className="mono" style={{ opacity: 0.75, fontSize: 12 }}>{m.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main style={{ padding: 12 }}>
          {err ? <div style={{ marginBottom: 12 }}><ErrorBox err={err} /></div> : null}

          {moduleId === 'PROJET_CONSTRUCTION' ? (
            <ConstructionProjectsPanel
              query={qProjects}
              refreshTick={projectsRefreshTick}
              newTick={projectsNewTick}
              canWrite={canWrite}
              onListStats={setProjectListStats}
            />
          ) : (
            <div className="entity-grid">
              {filtered.map((it) => {
                const card = entityCardFromRaw(it)
                return (
                  <RecensementEntityCard
                    key={it.id}
                    display={card}
                    onClick={() => openView(it)}
                    meta={
                      <>
                        <span className="pill pill--compact mono pill--neutral">
                          {it.domaineCategorie ?? it.kind}
                        </span>
                        {it.adresse ? (
                          <span className="pill pill--compact mono pill--neutral" title={it.adresse}>
                            {it.adresse.length > 28 ? `${it.adresse.slice(0, 28)}…` : it.adresse}
                          </span>
                        ) : null}
                      </>
                    }
                  />
                )
              })}
              {!filtered.length ? <div className="mono" style={{ opacity: 0.75 }}>—</div> : null}
            </div>
          )}
        </main>
      </div>

      {moduleId !== 'PROJET_CONSTRUCTION' && viewOpen && viewItem ? (
        <EntityViewModal
          open
          title={entityCardFromRaw(viewItem).primaryName}
          subtitle={
            viewItem.numeroDossier
              ? `N° ${viewItem.numeroDossier} · ${mod.label}`
              : mod.label
          }
          detailData={viewItem}
          canWrite={canWrite}
          onClose={closeView}
          onEdit={() => openEdit(viewItem)}
          onDelete={() => void remove(viewItem).then(() => closeView())}
          deleteBusy={busy}
        />
      ) : null}

      {moduleId !== 'PROJET_CONSTRUCTION' && modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ width: 980, maxWidth: '96vw' }}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>
                {modalMode === 'create' ? 'Nouveau' : 'Modifier'}
              </div>
              <button className="btn" onClick={closeModal}>Fermer</button>
            </div>

            <div className="modal-body">
              <div className="grid">
                {moduleId === 'DOMAINE_ETAT' ? (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type de bien</div>
                      <select
                        className="input"
                        value={form.domaineCategorie ?? 'EMPLACEMENT'}
                        onChange={(e) =>
                          setForm((v: any) => ({ ...v, domaineCategorie: e.target.value }))
                        }
                      >
                        <option value="EMPLACEMENT">Parcelle ou emplacement (terrain)</option>
                        <option value="PROPRIETE_BATIE">Propriété bâtie</option>
                      </select>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Désignation du bien</div>
                      <input
                        className="input"
                        value={form.designation ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, designation: e.target.value }))}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {moduleId !== 'LOGEMENT' && moduleId !== 'CIMETIERE' ? (
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <div className="label">
                          {moduleId === 'ENTREPRISE'
                            ? "Nom de l’entreprise"
                            : moduleId === 'ORGANISATION'
                              ? "Nom de l’organisation"
                              : moduleId === 'COMMERCANT'
                                ? 'Nom du commerce'
                                : moduleId === 'JEUX_HASARD'
                                  ? 'Nom de l’institution'
                                : moduleId === 'ECOLE' || moduleId === 'EGLISE'
                                  ? 'Nom de l’établissement'
                                : 'Dénomination'}
                        </div>
                        <input className="input" value={form.denomination ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, denomination: e.target.value }))} />
                      </div>
                    ) : null}
                    {moduleId !== 'ECOLE' &&
                    moduleId !== 'EGLISE' &&
                    moduleId !== 'LOGEMENT' &&
                    moduleId !== 'CIMETIERE' &&
                    moduleId !== 'JEUX_HASARD' ? (
                      <>
                        <div className="field">
                          <div className="label">Téléphone</div>
                          <input className="input mono" value={form.telephone ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, telephone: e.target.value }))} />
                        </div>
                        <div className="field">
                          <div className="label">E-mail</div>
                          <input className="input mono" value={form.email ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, email: e.target.value }))} />
                        </div>
                      </>
                    ) : null}
                    {moduleId === 'ENTREPRISE' ? (
                      <>
                        <div className="field">
                          <div className="label">CIN</div>
                          <input className="input mono" value={form.cin ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, cin: e.target.value }))} />
                        </div>
                        <div className="field">
                          <div className="label">NIF</div>
                          <input className="input mono" value={form.nif ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, nif: e.target.value }))} />
                        </div>
                      </>
                    ) : null}
                    {moduleId === 'ORGANISATION' ? (
                      <>
                        <div className="field">
                          <div className="label">CIN</div>
                          <input className="input mono" value={form.cin ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, cin: e.target.value }))} />
                        </div>
                        <div className="field">
                          <div className="label">NIF</div>
                          <input className="input mono" value={form.nif ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, nif: e.target.value }))} />
                        </div>
                      </>
                    ) : null}
                    {moduleId === 'COMMERCANT' ? (
                      <>
                        <div className="field">
                          <div className="label">Nom</div>
                          <input className="input" value={form.commercantNom ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, commercantNom: e.target.value }))} />
                        </div>
                        <div className="field">
                          <div className="label">Prénom</div>
                          <input className="input" value={form.commercantPrenom ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, commercantPrenom: e.target.value }))} />
                        </div>
                        <div className="field">
                          <div className="label">CIN</div>
                          <input className="input mono" value={form.cin ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, cin: e.target.value }))} />
                        </div>
                        <div className="field">
                          <div className="label">NIF</div>
                          <input className="input mono" value={form.nif ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, nif: e.target.value }))} />
                        </div>
                      </>
                    ) : null}
                  </>
                )}
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Adresse</div>
                  <input className="input" value={form.adresse ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, adresse: e.target.value }))} />
                </div>

                <RecensementGpsBlock show={recModuleUsesGps(moduleId)} form={form} setForm={setForm} disabled={busy} />

                {recModuleUsesPhotos(moduleId) ? (
                  <RecensementPhotoPicker
                    label={moduleId === 'ORGANISATION' ? 'Logo' : 'Photos'}
                    folder={s3FolderForRecModule(moduleId)}
                    photos={Array.isArray(form.photos) ? form.photos : []}
                    max={REC_ENTITY_PHOTOS_MAX}
                    disabled={busy}
                    orgLogo={moduleId === 'ORGANISATION'}
                    onChange={(next) => setForm((v: any) => ({ ...v, photos: next }))}
                    onError={(msg) => setErr(new Error(msg))}
                  />
                ) : null}

                {moduleId === 'DOMAINE_ETAT' && form.domaineCategorie === 'EMPLACEMENT' ? (
                  <div className="field">
                    <div className="label">Surface de la parcelle (m²)</div>
                    <input
                      className="input mono"
                      value={form.parcelleSurfaceM2 ?? ''}
                      onChange={(e) => setForm((v: any) => ({ ...v, parcelleSurfaceM2: e.target.value }))}
                    />
                  </div>
                ) : null}

                {moduleId === 'DOMAINE_ETAT' && form.domaineCategorie === 'PROPRIETE_BATIE' ? (
                  <>
                    <div className="field">
                      <div className="label">Superficie terrain (m²)</div>
                      <input
                        className="input mono"
                        value={form.superficieTerrainM2 ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, superficieTerrainM2: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Superficie construite (m²)</div>
                      <input
                        className="input mono"
                        value={form.superficieConstruiteM2 ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, superficieConstruiteM2: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Nombre de niveaux</div>
                      <input
                        className="input mono"
                        value={form.niveauxNombre ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, niveauxNombre: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <div className="label">Année de construction</div>
                      <input
                        className="input mono"
                        value={form.anneeConstruction ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, anneeConstruction: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Usage ou destination</div>
                      <input
                        className="input"
                        value={form.usageBatiment ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, usageBatiment: e.target.value }))}
                      />
                    </div>
                  </>
                ) : null}

                {moduleId === 'COMMERCANT' ? (
                  <>
                    <div className="field">
                      <div className="label">Marché (si fixe)</div>
                      <select className="input" value={form.marcheId ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, marcheId: e.target.value }))}>
                        <option value="">—</option>
                        {marches.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type de marchandise</div>
                      <input className="input" value={form.marchandiseType ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, marchandiseType: e.target.value }))} />
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type de vente</div>
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className={`btn ${form.venteType === 'GROS' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, venteType: 'GROS' }))}
                          disabled={busy}
                        >
                          Gros
                        </button>
                        <button
                          type="button"
                          className={`btn ${form.venteType === 'DETAIL' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, venteType: 'DETAIL' }))}
                          disabled={busy}
                        >
                          Détail
                        </button>
                      </div>
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Disposition</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`btn ${form.dispositionMarchandise === 'BARQUE' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, dispositionMarchandise: 'BARQUE' }))}
                          disabled={busy}
                        >
                          Barque
                        </button>
                        <button
                          type="button"
                          className={`btn ${form.dispositionMarchandise === 'AU_SOL' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, dispositionMarchandise: 'AU_SOL' }))}
                          disabled={busy}
                        >
                          Au sol
                        </button>
                        <button
                          type="button"
                          className={`btn ${form.dispositionMarchandise === 'ECHOPE' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, dispositionMarchandise: 'ECHOPE' }))}
                          disabled={busy}
                        >
                          Échoppe
                        </button>
                      </div>
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Assainissement</div>
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        {[1, 2, 3].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`btn ${Number(form.categoryTier) === n ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, categoryTier: String(n) }))}
                            disabled={busy}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <div className="mono" style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                        Requis
                      </div>
                    </div>
                  </>
                ) : null}

                {moduleId === 'ECOLE' ? (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">Assainissement</div>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`btn ${Number(form.categoryTier) === n ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, categoryTier: String(n) }))}
                          disabled={busy}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="mono" style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                      Requis
                    </div>
                  </div>
                ) : null}

                {moduleId === 'EGLISE' ? (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">Assainissement</div>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`btn ${Number(form.categoryTier) === n ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, categoryTier: String(n) }))}
                          disabled={busy}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="mono" style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                      Requis
                    </div>
                  </div>
                ) : null}

                {moduleId === 'JEUX_HASARD' ? (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">Assainissement</div>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`btn ${Number(form.categoryTier) === n ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, categoryTier: String(n) }))}
                          disabled={busy}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="mono" style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                      Requis
                    </div>
                  </div>
                ) : null}

                {moduleId === 'CIMETIERE' ? (
                  <>
                    <div className="field">
                      <div className="label">Cimetière</div>
                      <select className="input" value={form.cimetiereId ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, cimetiereId: e.target.value }))}>
                        <option value="">—</option>
                        {cimetieres.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type d’emplacement</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`btn ${form.sepultureType === 'CAVEAU' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, sepultureType: 'CAVEAU' }))}
                          disabled={busy}
                        >
                          Caveau
                        </button>
                        <button
                          type="button"
                          className={`btn ${form.sepultureType === 'CERCA' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, sepultureType: 'CERCA' }))}
                          disabled={busy}
                        >
                          Cerca
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <div className="label">Nombre de places</div>
                      <input className="input mono" value={form.sepulturePlaces ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, sepulturePlaces: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Superficie (m²)</div>
                      <input className="input mono" value={form.sepultureSurfaceM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, sepultureSurfaceM2: e.target.value }))} />
                    </div>
                  </>
                ) : null}

                {moduleId === 'JEUX_HASARD' ? (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type d’établissement</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`btn ${form.jeuxHasardType === 'BORLETTE' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, jeuxHasardType: 'BORLETTE' }))}
                          disabled={busy}
                        >
                          Borlette
                        </button>
                        <button
                          type="button"
                          className={`btn ${form.jeuxHasardType === 'PARIAGE' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, jeuxHasardType: 'PARIAGE' }))}
                          disabled={busy}
                        >
                          Pariages
                        </button>
                        <button
                          type="button"
                          className={`btn ${form.jeuxHasardType === 'COMBAT_COQ' ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, jeuxHasardType: 'COMBAT_COQ' }))}
                          disabled={busy}
                        >
                          Combat de coq
                        </button>
                      </div>
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type d’emplacement</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['GUICHET', 'Guichet'],
                          ['TABLE', 'Table'],
                          ['PROPRIETE_BATIE', 'Propriété bâtie'],
                          ['BARQUE', 'Barque'],
                          ['MACHINE_MOBILE', 'Machine mobile'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.jeuxHasardEmplacement === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, jeuxHasardEmplacement: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {moduleId === 'ENTREPRISE' ? (
                  <>
                    <div className="field">
                      <div className="label">Domaine d’activité</div>
                      <input
                        className="input"
                        value={form.activiteDomaine ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, activiteDomaine: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <div className="label">NIF de l’entreprise</div>
                      <input className="input mono" value={form.nif ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, nif: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type d’affichage</div>
                      <input className="input" value={form.affichageType ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, affichageType: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Affichage public</div>
                    </div>
                    <div className="field">
                      <div className="label">Billboard (quantité)</div>
                      <input className="input mono" value={form.qtyBillboard ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, qtyBillboard: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Enseigne (quantité)</div>
                      <input className="input mono" value={form.qtyEnseigne ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, qtyEnseigne: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Fresque murale (quantité)</div>
                      <input className="input mono" value={form.qtyFresque ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, qtyFresque: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Assainissement</div>
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        {[1, 2, 3].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`btn ${Number(form.categoryTier) === n ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, categoryTier: String(n) }))}
                            disabled={busy}
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, categoryTier: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                {moduleId === 'ORGANISATION' ? (
                  <>
                    <div className="field">
                      <div className="label">Domaine d’intervention</div>
                      <input className="input" value={form.activiteDomaine ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, activiteDomaine: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Sigle</div>
                      <input className="input mono" value={form.orgSigle ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, orgSigle: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Reconnu par le MAST</div>
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className={`btn ${!!form.orgReconnueMasse ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, orgReconnueMasse: true }))}
                          disabled={busy}
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          className={`btn ${!form.orgReconnueMasse ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, orgReconnueMasse: false }))}
                          disabled={busy}
                        >
                          Non
                        </button>
                      </div>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Reconnu par la mairie</div>
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className={`btn ${!!form.orgReconnueMairie ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, orgReconnueMairie: true }))}
                          disabled={busy}
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          className={`btn ${!form.orgReconnueMairie ? 'primary' : ''}`}
                          onClick={() => setForm((v: any) => ({ ...v, orgReconnueMairie: false }))}
                          disabled={busy}
                        >
                          Non
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <div className="label">Date de fondation</div>
                      <input
                        className="input mono"
                        placeholder="AAAA-MM-JJ"
                        value={form.orgDateFondation ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, orgDateFondation: e.target.value }))}
                      />
                    </div>
                  </>
                ) : null}

                {moduleId !== 'COMMERCANT' &&
                moduleId !== 'DOMAINE_ETAT' &&
                moduleId !== 'ENTREPRISE' ? (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">
                      {moduleId === 'ORGANISATION'
                        ? 'Responsable'
                        : moduleId === 'EGLISE'
                          ? 'Pasteur'
                          : 'Propriétaire'}
                    </div>
                    <div className="row">
                      <input className="input" style={{ flex: 1 }} placeholder="Nom" value={form.proprietaireNom ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireNom: e.target.value }))} />
                      <input className="input" style={{ flex: 1 }} placeholder="Prénom" value={form.proprietairePrenom ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietairePrenom: e.target.value }))} />
                      <input className="input mono" style={{ flex: 1 }} placeholder="Téléphone" value={form.proprietaireTelephone ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireTelephone: e.target.value }))} />
                    </div>
                    {moduleId === 'ORGANISATION' ||
                    moduleId === 'ECOLE' ||
                    moduleId === 'EGLISE' ||
                    moduleId === 'LOGEMENT' ||
                    moduleId === 'JEUX_HASARD' ? (
                      <>
                        <div className="row" style={{ marginTop: 8 }}>
                          <input className="input mono" style={{ flex: 1 }} placeholder="E-mail" value={form.proprietaireEmail ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireEmail: e.target.value }))} />
                          <input className="input mono" style={{ flex: 1 }} placeholder="CIN / NIN" value={form.proprietaireCin ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireCin: e.target.value }))} />
                          <input className="input mono" style={{ flex: 1 }} placeholder="NIF (si disponible)" value={form.proprietaireNif ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireNif: e.target.value }))} />
                        </div>
                        {moduleId === 'ECOLE' || moduleId === 'EGLISE' || moduleId === 'LOGEMENT' ? (
                          <div className="row" style={{ marginTop: 8 }}>
                            <input
                              className="input"
                              style={{ flex: 1 }}
                              placeholder="Adresse du propriétaire"
                              value={form.proprietaireAdresse ?? ''}
                              onChange={(e) => setForm((v: any) => ({ ...v, proprietaireAdresse: e.target.value }))}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {moduleId === 'LOGEMENT' ? (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Statut</div>
                    </div>
                    <div className="field">
                      <div className="label">Année de construction</div>
                      <input
                        className="input mono"
                        placeholder="YYYY"
                        value={form.anneeConstruction ?? ''}
                        onChange={(e) => setForm((v: any) => ({ ...v, anneeConstruction: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Occupation</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['HABITE_PAR_PROPRIETAIRE', 'Habité'],
                          ['EN_FERMAGE', 'Fermage'],
                          ['EN_LOCATION', 'Location'],
                          ['EN_USUFRUIT', 'Usufruit'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.logementOccupation === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, logementOccupation: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, logementOccupation: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Évaluation</div>
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Nature de la maison</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['BLOC', 'Bloc'],
                          ['BOIS', 'Bois'],
                          ['TOLE', 'Tôle'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.logementMur === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, logementMur: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, logementMur: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <div className="label">Toilettes (nombre)</div>
                      <input className="input mono" value={form.toilettesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, toilettesNombre: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Toilettes (nature)</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['BLOC', 'Bloc'],
                          ['BOIS', 'Bois'],
                          ['TOLE', 'Tôle'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.toilettesNature === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, toilettesNature: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, toilettesNature: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <div className="label">Cuisines (nombre)</div>
                      <input className="input mono" value={form.cuisinesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, cuisinesNombre: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Cuisines (nature)</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['BLOC', 'Bloc'],
                          ['BOIS', 'Bois'],
                          ['TOLE', 'Tôle'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.cuisinesNature === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, cuisinesNature: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, cuisinesNature: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <div className="label">Nombre d’étages</div>
                      <input className="input mono" value={form.etagesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, etagesNombre: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Nombre d’appartements</div>
                      <input className="input mono" value={form.appartementsNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, appartementsNombre: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Chambres à coucher</div>
                      <input className="input mono" value={form.chambresNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, chambresNombre: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Garages</div>
                      <input className="input mono" value={form.garagesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, garagesNombre: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Salons</div>
                      <input className="input mono" value={form.salonsNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, salonsNombre: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Balcons</div>
                      <input className="input mono" value={form.balconsNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, balconsNombre: e.target.value }))} />
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Nature du plancher</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['MOSAIQUE', 'Mosaïque'],
                          ['PLANCHE', 'Planche'],
                          ['MACADAM', 'Macadam'],
                          ['GLASSI', 'Glassi'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.plancherNature === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, plancherNature: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, plancherNature: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Toiture (plusieurs choix possibles)</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['TOLE', 'Tôle'],
                          ['BETON', 'Béton'],
                          ['PLANCHE', 'Planche'],
                          ['BRIC', 'Brique'],
                          ['CHINGLE', 'Chingle'],
                        ].map(([k, label]) => {
                          const list = Array.isArray(form.toitureNatures) ? (form.toitureNatures as string[]) : []
                          const on = list.includes(k)
                          return (
                            <button
                              key={k}
                              type="button"
                              className={`btn ${on ? 'primary' : ''}`}
                              onClick={() =>
                                setForm((v: any) => {
                                  const prev = Array.isArray(v.toitureNatures) ? (v.toitureNatures as string[]) : []
                                  const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
                                  return { ...v, toitureNatures: next }
                                })
                              }
                              disabled={busy}
                            >
                              {label}
                            </button>
                          )
                        })}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, toitureNatures: [] }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <div className="label">Mètres carrés de construction</div>
                      <input className="input mono" value={form.surfaceM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, surfaceM2: e.target.value }))} />
                    </div>

                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Utilisation de l’immeuble</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['INDUSTRIELLE', 'Industrielle'],
                          ['RESIDENTIELLE', 'Résidentielle'],
                          ['COMMERCIALE', 'Commerciale'],
                          ['COMMUNAUTAIRE', 'Communautaire'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.immeubleUsage === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, immeubleUsage: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, immeubleUsage: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                {moduleId === 'ECOLE' ? (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Bâtiment de l’école</div>
                    </div>
                    <div className="field">
                      <div className="label">Nombre d’élèves</div>
                      <input className="input mono" value={form.elevesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, elevesNombre: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Superficie du terrain (m²)</div>
                      <input className="input mono" value={form.superficieTerrainM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, superficieTerrainM2: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Superficie construite (m²)</div>
                      <input className="input mono" value={form.superficieConstruiteM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, superficieConstruiteM2: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Niveau (nombre)</div>
                      <input className="input mono" value={form.niveauxNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, niveauxNombre: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type de construction</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['S_METAL', 'S. métal'],
                          ['S_BETON', 'S. béton'],
                          ['AUTRE', 'Autre'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.constructionType === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, constructionType: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, constructionType: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Préciser (si autre)</div>
                      <input className="input" value={form.constructionTypePrecise ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, constructionTypePrecise: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Nombre de salles</div>
                      <input className="input mono" value={form.sallesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, sallesNombre: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Superficie des salles (m²)</div>
                      <input className="input mono" value={form.sallesSuperficieM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, sallesSuperficieM2: e.target.value }))} />
                    </div>
                  </>
                ) : null}

                {moduleId === 'EGLISE' ? (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Église</div>
                    </div>
                    <div className="field">
                      <div className="label">Nombre de membres</div>
                      <input className="input mono" value={form.membresNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, membresNombre: e.target.value }))} />
                    </div>
                  </>
                ) : null}

                {moduleId === 'ECOLE' || moduleId === 'EGLISE' ? (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Évaluation</div>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Type de construction</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['BLOC', 'Bloc'],
                          ['BOIS', 'Bois'],
                          ['TOLE', 'Tôle'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.logementMur === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, logementMur: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, logementMur: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <div className="label">Toilettes (nombre)</div>
                      <input className="input mono" value={form.toilettesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, toilettesNombre: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Toilettes (nature)</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['BLOC', 'Bloc'],
                          ['BOIS', 'Bois'],
                          ['TOLE', 'Tôle'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.toilettesNature === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, toilettesNature: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, toilettesNature: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <div className="label">Cuisines (nombre)</div>
                      <input className="input mono" value={form.cuisinesNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, cuisinesNombre: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Cuisines (nature)</div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          ['BLOC', 'Bloc'],
                          ['BOIS', 'Bois'],
                          ['TOLE', 'Tôle'],
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className={`btn ${form.cuisinesNature === k ? 'primary' : ''}`}
                            onClick={() => setForm((v: any) => ({ ...v, cuisinesNature: k }))}
                            disabled={busy}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((v: any) => ({ ...v, cuisinesNature: '' }))}
                          disabled={busy}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <div className="label">Chambres</div>
                      <input className="input mono" value={form.chambresNombre ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, chambresNombre: e.target.value }))} />
                    </div>
                  </>
                ) : null}

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Notes</div>
                  <textarea className="input" rows={4} value={form.notes ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, notes: e.target.value }))} />
                </div>

                {modalMode === 'edit' && selected ? (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <button className="btn danger" onClick={() => void remove(selected)} disabled={busy}>Supprimer</button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={closeModal} disabled={busy}>Annuler</button>
              <button className="btn primary" onClick={() => void save()} disabled={busy}>Enregistrer</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ConstructionProjectsPanel({
  query,
  refreshTick,
  newTick,
  canWrite,
  onListStats,
}: {
  query: string
  refreshTick: number
  newTick: number
  canWrite: boolean
  onListStats?: (stats: { total: number; filtered: number; busy: boolean }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [items, setItems] = useState<ConstructionProject[]>([])
  const [logements, setLogements] = useState<RecEntity[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selected, setSelected] = useState<ConstructionProject | null>(null)
  const [form, setForm] = useState<any>(() => ({ statut: 'PREPARATION' }))
  const [viewOpen, setViewOpen] = useState(false)
  const [viewItem, setViewItem] = useState<ConstructionProject | null>(null)

  const load = async () => {
    setErr(null)
    setBusy(true)
    try {
      const [projRes, logRes] = await Promise.all([
        apiFetch<any>('/recensement/construction-projects'),
        apiFetch<any>('/recensement/entities?kind=LOGEMENT'),
      ])
      setItems(sortByCreatedAtDesc(normalizeConstructionProjects(projRes)))
      setLogements(normalizeRecEntities(logRes))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (refreshTick <= 0) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  useEffect(() => {
    if (newTick <= 0) return
    openCreate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTick])

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase()
    const base = sortByCreatedAtDesc(items)
    if (!s) return base
    return base.filter((it) => {
      const hay = [
        it.numeroDossier,
        it.denomination,
        it.natureTravaux,
        it.adresse,
        it.telephone,
        it.proprietaireNom,
        it.proprietairePrenom,
        it.proprietaireTelephone,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ')
      return hay.includes(s)
    })
  }, [items, query])

  useEffect(() => {
    onListStats?.({ total: items.length, filtered: filtered.length, busy })
  }, [items.length, filtered.length, busy, onListStats])

  const openCreate = () => {
    setSelected(null)
    setModalMode('create')
    setForm({
      statut: 'PREPARATION',
      telephone: '',
      adresse: '',
      proprietaireNom: '',
      proprietairePrenom: '',
      proprietaireTelephone: '',
      proprietaireEmail: '',
      proprietaireNif: '',
      categorieTravail: '',
      natureTravaux: '',
      superficieTerrainM2: '',
      superficieAutoriseeConstruireM2: '',
      surfacePrevueM2: '',
      clotureMl: '',
      niveauOuHauteur: '',
      superficieBatimentDemolirM2: '',
      nomIngenieurArchitecte: '',
      dureePermisConstruire: '',
      linkedLogementEntityId: '',
      resultLogementEntityId: '',
      notes: '',
      photos: [],
      gpsLatitude: '',
      gpsLongitude: '',
      gpsAccuracy: '',
    })
    setModalOpen(true)
  }

  const openView = (it: ConstructionProject) => {
    setViewItem(it)
    setViewOpen(true)
  }

  const closeView = () => {
    setViewOpen(false)
    setViewItem(null)
  }

  const openEdit = (it: ConstructionProject) => {
    closeView()
    setSelected(it)
    setModalMode('edit')
    setForm({
      statut: it.statut ?? 'PREPARATION',
      numeroDossier: it.numeroDossier ?? '',
      telephone: it.telephone ?? '',
      adresse: it.adresse ?? '',
      proprietaireNom: it.proprietaireNom ?? '',
      proprietairePrenom: it.proprietairePrenom ?? '',
      proprietaireTelephone: it.proprietaireTelephone ?? '',
      proprietaireEmail: it.proprietaireEmail ?? '',
      proprietaireNif: it.proprietaireNif ?? '',
      categorieTravail: it.categorieTravail ?? '',
      natureTravaux: mergeConstructionWorksDescription(it),
      superficieTerrainM2: it.superficieTerrainM2 != null ? String(it.superficieTerrainM2) : '',
      superficieAutoriseeConstruireM2:
        it.superficieAutoriseeConstruireM2 != null ? String(it.superficieAutoriseeConstruireM2) : '',
      surfacePrevueM2: it.surfacePrevueM2 != null ? String(it.surfacePrevueM2) : '',
      clotureMl: it.clotureMl != null ? String(it.clotureMl) : '',
      niveauOuHauteur: it.niveauOuHauteur ?? '',
      superficieBatimentDemolirM2:
        it.superficieBatimentDemolirM2 != null ? String(it.superficieBatimentDemolirM2) : '',
      nomIngenieurArchitecte: it.nomIngenieurArchitecte ?? '',
      dureePermisConstruire: it.dureePermisConstruire ?? '',
      linkedLogementEntityId: it.linkedLogementEntityId ?? '',
      resultLogementEntityId: it.resultLogementEntityId ?? '',
      notes: it.notes ?? '',
      photos: normalizeRecPhotos(it.photos),
      gpsLatitude: it.gpsPoint?.latitude != null ? String(it.gpsPoint.latitude) : '',
      gpsLongitude: it.gpsPoint?.longitude != null ? String(it.gpsPoint.longitude) : '',
      gpsAccuracy:
        it.gpsPoint?.accuracy != null && Number.isFinite(Number(it.gpsPoint.accuracy))
          ? String(it.gpsPoint.accuracy)
          : '',
    })
    setModalOpen(true)
  }

  const closeModal = () => setModalOpen(false)

  const save = async () => {
    setErr(null)
    setBusy(true)
    try {
      const catRaw = String(form.categorieTravail ?? '').trim()
      const cat = catRaw.length ? catRaw : null
      const showBuildingSurfaces = !cat || cat === 'AUTRE' || isBuildingSurfaceCategory(cat)
      const showClotureExclusive = cat === 'CLOTURE'
      const showClotureAnnexe = !cat || cat === 'AUTRE'

      function parseWhen(show: boolean, raw: unknown): number | null | 'invalid' {
        if (!show) return null
        return parseOptionalPositiveNumber(raw)
      }

      const ter = parseWhen(showBuildingSurfaces, form.superficieTerrainM2)
      const aut = parseWhen(showBuildingSurfaces, form.superficieAutoriseeConstruireM2)
      const surfProjet = parseWhen(showBuildingSurfaces, form.surfacePrevueM2)
      const dem = parseWhen(showBuildingSurfaces, form.superficieBatimentDemolirM2)
      const clo = parseWhen(showClotureExclusive || showClotureAnnexe, form.clotureMl)

      if (
        ter === 'invalid' ||
        aut === 'invalid' ||
        surfProjet === 'invalid' ||
        clo === 'invalid' ||
        dem === 'invalid'
      ) {
        throw new Error('Valeur numérique invalide.')
      }

      const la = Number(String(form.gpsLatitude ?? '').trim().replace(',', '.'))
      const lo = Number(String(form.gpsLongitude ?? '').trim().replace(',', '.'))
      const accRaw = String(form.gpsAccuracy ?? '').trim().replace(',', '.')
      const acc = accRaw ? Number(accRaw) : NaN
      let gpsPoint: any = null
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        gpsPoint = {
          latitude: la,
          longitude: lo,
          recordedAt: new Date().toISOString(),
        }
        if (Number.isFinite(acc) && acc >= 0) gpsPoint.accuracy = acc
      }

      const photoList = Array.isArray(form.photos)
        ? (form.photos as RecPhotoRow[]).filter((p) => typeof p?.key === 'string' && p.key.trim().length)
        : []

      const linkId = String(form.linkedLogementEntityId ?? '').trim()
      const resultId = String(form.resultLogementEntityId ?? '').trim()

      const payload: Record<string, unknown> = {
        statut: form.statut ?? 'PREPARATION',
        telephone: normConstructionPayloadString(form.telephone),
        adresse: normConstructionPayloadString(form.adresse),
        proprietaireNom: normConstructionPayloadString(form.proprietaireNom),
        proprietairePrenom: normConstructionPayloadString(form.proprietairePrenom),
        proprietaireTelephone: normConstructionPayloadString(form.proprietaireTelephone),
        proprietaireEmail: normConstructionPayloadString(form.proprietaireEmail),
        proprietaireNif: normConstructionPayloadString(form.proprietaireNif),
        categorieTravail: cat,
        natureTravaux: normConstructionPayloadString(form.natureTravaux),
        superficieTerrainM2: showBuildingSurfaces ? (ter === null ? null : ter) : null,
        superficieAutoriseeConstruireM2: showBuildingSurfaces ? (aut === null ? null : aut) : null,
        surfacePrevueM2: showBuildingSurfaces ? (surfProjet === null ? null : surfProjet) : null,
        clotureMl: showClotureExclusive || showClotureAnnexe ? (clo === null ? null : clo) : null,
        niveauOuHauteur: showBuildingSurfaces
          ? normConstructionPayloadString(form.niveauOuHauteur)
          : null,
        superficieBatimentDemolirM2: showBuildingSurfaces ? (dem === null ? null : dem) : null,
        nomIngenieurArchitecte: normConstructionPayloadString(form.nomIngenieurArchitecte),
        dureePermisConstruire: normConstructionPayloadString(form.dureePermisConstruire),
        gpsPoint,
        photos: photoList.length ? photoList : null,
        notes: normConstructionPayloadString(form.notes),
        linkedLogementEntityId: linkId.length ? linkId : null,
        resultLogementEntityId: resultId.length ? resultId : null,
      }

      if (modalMode === 'create') {
        await apiFetch('/recensement/construction-projects', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        if (!selected?.id) throw new Error('ID manquant')
        await apiFetch(`/recensement/construction-projects/${encodeURIComponent(selected.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      }
      await load()
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (it: ConstructionProject) => {
    const title = constructionProjectListTitle(it)
    if (!window.confirm(`Supprimer le dossier « ${title} » ?`)) return
    setErr(null)
    setBusy(true)
    try {
      await apiFetch(`/recensement/construction-projects/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const cat = String(form.categorieTravail ?? '').trim() || null
  const showBuildingSurfaces = !cat || cat === 'AUTRE' || isBuildingSurfaceCategory(cat)
  const showClotureExclusive = cat === 'CLOTURE'
  const showClotureAnnexe = !cat || cat === 'AUTRE'
  const permisSectionTitle = isInfraCategory(cat) ? 'Autorisations et permis' : 'Ingénieur et permis'

  return (
    <div>
      <div className="module-panel-title">Projets de construction</div>

      {err ? <div style={{ marginBottom: 12 }}><ErrorBox err={err} /></div> : null}

      <div className="entity-grid">
        {filtered.map((it) => {
          const card = entityCardFromRaw(it)
          return (
            <RecensementEntityCard
              key={it.id}
              display={card}
              title={constructionProjectListTitle(it)}
              onClick={() => openView(it)}
              meta={
                <>
                  <span className="pill pill--compact mono" data-statut={it.statut}>
                    {labelConstructionStatut(it.statut)}
                  </span>
                  {it.categorieTravail ? (
                    <span className="pill pill--compact mono pill--neutral">
                      {labelConstructionCategorie(it.categorieTravail)}
                    </span>
                  ) : null}
                </>
              }
            />
          )
        })}
        {!filtered.length ? <div className="mono" style={{ opacity: 0.75 }}>—</div> : null}
      </div>

      {viewOpen && viewItem ? (
        <EntityViewModal
          open
          title={entityCardFromRaw(viewItem).primaryName}
          subtitle={
            viewItem.numeroDossier
              ? `N° ${viewItem.numeroDossier} · Projet de construction`
              : 'Projet de construction'
          }
          detailData={viewItem}
          canWrite={canWrite}
          onClose={closeView}
          onEdit={() => openEdit(viewItem)}
          onDelete={() => void remove(viewItem).then(() => closeView())}
          deleteBusy={busy}
        />
      ) : null}

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ width: 980, maxWidth: '96vw' }}>
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>{modalMode === 'create' ? 'Nouveau projet' : 'Modifier projet'}</div>
              <button className="btn" onClick={closeModal}>Fermer</button>
            </div>
            <div className="modal-body">
              <div className="grid">
                {modalMode === 'edit' && form.numeroDossier ? (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">N° dossier (archive)</div>
                    <input className="input mono" readOnly value={form.numeroDossier ?? ''} style={{ opacity: 0.9 }} />
                  </div>
                ) : null}

                <div className="field">
                  <div className="label">Statut</div>
                  <select className="input" value={form.statut ?? 'PREPARATION'} onChange={(e) => setForm((v: any) => ({ ...v, statut: e.target.value }))}>
                    <option value="PREPARATION">{labelConstructionStatut('PREPARATION')}</option>
                    <option value="EN_COURS">{labelConstructionStatut('EN_COURS')}</option>
                    <option value="TERMINE">{labelConstructionStatut('TERMINE')}</option>
                    <option value="ABANDONNE">{labelConstructionStatut('ABANDONNE')}</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Téléphone (contact chantier)</div>
                  <input className="input mono" value={form.telephone ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, telephone: e.target.value }))} />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Localisation / adresse</div>
                  <input className="input" value={form.adresse ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, adresse: e.target.value }))} />
                </div>

                <RecensementGpsBlock show form={form} setForm={setForm} disabled={busy} />

                <RecensementPhotoPicker
                  label="Photos"
                  folder="projets-construction"
                  photos={Array.isArray(form.photos) ? form.photos : []}
                  max={REC_ENTITY_PHOTOS_MAX}
                  disabled={busy}
                  onChange={(next) => setForm((v: any) => ({ ...v, photos: next }))}
                  onError={(msg) => setErr(new Error(msg))}
                />

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Propriétaire ou institution — nom</div>
                  <input className="input" value={form.proprietaireNom ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireNom: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">Prénom (si personne physique)</div>
                  <input className="input" value={form.proprietairePrenom ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietairePrenom: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">Téléphone propriétaire</div>
                  <input className="input mono" value={form.proprietaireTelephone ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireTelephone: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">E-mail</div>
                  <input className="input" value={form.proprietaireEmail ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireEmail: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">NIF / NIU</div>
                  <input className="input mono" value={form.proprietaireNif ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, proprietaireNif: e.target.value }))} />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Catégorie de travaux</div>
                  <select
                    className="input"
                    value={form.categorieTravail ?? ''}
                    onChange={(e) => setForm((v: any) => ({ ...v, categorieTravail: e.target.value }))}
                  >
                    <option value="">— Non précisée —</option>
                    {CONSTRUCTION_CATEGORIES_TRAVAIL.map((c) => (
                      <option key={c} value={c}>{labelConstructionCategorie(c)}</option>
                    ))}
                  </select>
                </div>

                {showClotureExclusive ? (
                  <div className="field">
                    <div className="label">Longueur clôture (ml)</div>
                    <input className="input mono" value={form.clotureMl ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, clotureMl: e.target.value }))} />
                  </div>
                ) : null}

                {showBuildingSurfaces ? (
                  <>
                    <div className="field">
                      <div className="label">Superficie globale du terrain (m²)</div>
                      <input className="input mono" value={form.superficieTerrainM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, superficieTerrainM2: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Superficie autorisée à construire (m²)</div>
                      <input className="input mono" value={form.superficieAutoriseeConstruireM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, superficieAutoriseeConstruireM2: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Superficie prévue pour ce projet (m²)</div>
                      <input className="input mono" value={form.surfacePrevueM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, surfacePrevueM2: e.target.value }))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <div className="label">Niveau du bâtiment / hauteur</div>
                      <input className="input" value={form.niveauOuHauteur ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, niveauOuHauteur: e.target.value }))} />
                    </div>
                    <div className="field">
                      <div className="label">Superficie bâtiment à démolir (m²)</div>
                      <input className="input mono" value={form.superficieBatimentDemolirM2 ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, superficieBatimentDemolirM2: e.target.value }))} />
                    </div>
                  </>
                ) : null}

                {showClotureAnnexe && !showClotureExclusive ? (
                  <div className="field">
                    <div className="label">Clôture (ml)</div>
                    <input className="input mono" value={form.clotureMl ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, clotureMl: e.target.value }))} />
                  </div>
                ) : null}

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Travaux à réaliser</div>
                  <textarea className="input" rows={4} value={form.natureTravaux ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, natureTravaux: e.target.value }))} />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label mono" style={{ opacity: 0.85 }}>{permisSectionTitle}</div>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Ingénieur ou architecte (nom, coordonnées)</div>
                  <input className="input" value={form.nomIngenieurArchitecte ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, nomIngenieurArchitecte: e.target.value }))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Durée du permis de construire</div>
                  <input className="input" value={form.dureePermisConstruire ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, dureePermisConstruire: e.target.value }))} />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Propriété bâtie liée (chantier existant)</div>
                  <select
                    className="input"
                    value={form.linkedLogementEntityId ?? ''}
                    onChange={(e) => setForm((v: any) => ({ ...v, linkedLogementEntityId: e.target.value }))}
                  >
                    <option value="">— Aucune —</option>
                    {logements.map((l) => (
                      <option key={l.id} value={l.id}>{l.denomination?.trim() ? l.denomination : l.id}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Fiche propriété bâtie issue du projet (après achèvement)</div>
                  <select
                    className="input"
                    value={form.resultLogementEntityId ?? ''}
                    onChange={(e) => setForm((v: any) => ({ ...v, resultLogementEntityId: e.target.value }))}
                  >
                    <option value="">— Aucune —</option>
                    {logements.map((l) => (
                      <option key={l.id} value={l.id}>{l.denomination?.trim() ? l.denomination : l.id}</option>
                    ))}
                  </select>
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Notes internes</div>
                  <textarea className="input" rows={3} value={form.notes ?? ''} onChange={(e) => setForm((v: any) => ({ ...v, notes: e.target.value }))} />
                </div>

                {modalMode === 'edit' && selected ? (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <button className="btn danger" onClick={() => void remove(selected)} disabled={busy}>Supprimer</button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={closeModal} disabled={busy}>Annuler</button>
              <button className="btn primary" onClick={() => void save()} disabled={busy}>Enregistrer</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AdministrationRolesPage() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [q, setQ] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'view'>('view')
  const [selected, setSelected] = useState<RoleItem | null>(null)
  const [form, setForm] = useState(() => ({ code: '', label: '', description: '' }))

  const load = async () => {
    setErr(null)
    setBusy(true)
    try {
      const r = await apiFetch<any>('/admin/roles')
      setRoles(normalizeRoles(r))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return roles
    return roles.filter((r) => {
      const a = `${r.code} ${r.label} ${r.description ?? ''}`.toLowerCase()
      return a.includes(s)
    })
  }, [roles, q])

  const openCreate = () => {
    setSelected(null)
    setForm({ code: '', label: '', description: '' })
    setModalMode('create')
    setModalOpen(true)
  }

  const openView = (r: RoleItem) => {
    setSelected(r)
    setForm({ code: r.code, label: r.label, description: r.description ?? '' })
    setModalMode('view')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelected(null)
    setModalMode('view')
  }

  const save = async () => {
    setErr(null)
    setBusy(true)
    try {
      const payload: any = {
        code: form.code.trim(),
        label: form.label.trim(),
      }
      const d = form.description.trim()
      if (d) payload.description = d
      await apiFetch('/admin/roles', { method: 'POST', body: JSON.stringify(payload) })
      await load()
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: RoleItem) => {
    if (r.isSystem) {
      setErr(new Error('Impossible de supprimer un rôle système'))
      return
    }
    if (!window.confirm(`Supprimer le rôle "${r.code}" ?`)) return
    setErr(null)
    setBusy(true)
    try {
      await apiFetch(`/admin/roles/${encodeURIComponent(r.code)}`, { method: 'DELETE' })
      await load()
      closeModal()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>Administration • Rôles</div>
        <div className="row">
          <input
            className="input mono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            style={{ width: 240 }}
          />
          <button className="btn" onClick={load} disabled={busy}>
            Actualiser
          </button>
          <button className="btn primary" onClick={openCreate} disabled={busy}>
            Nouveau
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorBox err={err} />
        </div>
      ) : null}

      <div className="user-grid">
        {filtered.map((r) => (
          <button key={r.code} className="user-card" type="button" onClick={() => openView(r)}>
            <div className="user-card-body">
              <div className="user-card-kicker">Rôle</div>
              <div className="user-card-heading">{r.label}</div>
              <div className="user-card-meta">
                <span className="pill pill--compact mono pill--neutral">{r.code}</span>
                {r.isSystem ? <span className="pill pill--compact mono pill--neutral">système</span> : null}
                {!r.active ? (
                  <span className="pill pill--compact mono" style={{ borderColor: 'var(--danger)', background: '#f3dada' }}>
                    inactif
                  </span>
                ) : null}
              </div>
              {r.description ? <div className="user-card-sub">{r.description}</div> : null}
            </div>
          </button>
        ))}
        {!filtered.length ? <div className="mono" style={{ opacity: 0.75 }}>—</div> : null}
      </div>

      {modalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div style={{ fontWeight: 900 }}>{modalMode === 'create' ? 'Nouveau rôle' : 'Rôle'}</div>
              <button className="btn" onClick={closeModal}>
                Fermer
              </button>
            </div>

            <div className="modal-body">
              {modalMode === 'view' && selected ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="mono" style={{ opacity: 0.9 }}>
                    {selected.code}
                  </div>
                  <div className="row">
                    <button className="btn danger" onClick={() => void remove(selected)} disabled={busy || selected.isSystem}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Code</div>
                  <input
                    className="input mono"
                    value={form.code}
                    disabled={busy || modalMode !== 'create'}
                    onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
                    placeholder="ex. agent, rh, inspecteur"
                  />
                </div>
                <div className="field">
                  <div className="label">Libellé</div>
                  <input
                    className="input"
                    value={form.label}
                    disabled={busy || modalMode !== 'create'}
                    onChange={(e) => setForm((v) => ({ ...v, label: e.target.value }))}
                    placeholder="ex. Inspecteur"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">Description</div>
                  <input
                    className="input"
                    value={form.description}
                    disabled={busy || modalMode !== 'create'}
                    onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                    placeholder="Optionnel"
                  />
                </div>
              </div>
            </div>

            {modalMode === 'create' ? (
              <div className="modal-footer">
                <button className="btn" onClick={closeModal} disabled={busy}>
                  Annuler
                </button>
                <button className="btn primary" onClick={() => void save()} disabled={busy}>
                  Enregistrer
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HomeAuthedView({
  settings,
  mePayload,
  busy,
  onRefreshMe,
}: {
  settings: AppSettings
  mePayload: unknown
  busy: boolean
  onRefreshMe: () => void
}) {
  const rawUser = (mePayload as any)?.user ?? null
  const u = (rawUser && typeof rawUser === 'object' ? rawUser : null) as any
  const fallback = settings.user
  const displayName =
    typeof u?.displayName === 'string' && u.displayName.trim()
      ? u.displayName.trim()
      : fallback?.displayName?.trim()
        ? fallback.displayName.trim()
        : null
  const role = typeof u?.role === 'string' && u.role.trim() ? u.role.trim() : fallback?.role?.trim() ? fallback.role.trim() : null
  const profilePhotoUrl = typeof u?.profilePhotoUrl === 'string' && u.profilePhotoUrl.trim() ? u.profilePhotoUrl.trim() : null

  return (
    <div className="card home-card">
      <div className="home-top">
        <div className="home-title">
          <div className="home-h1">Accueil</div>
        </div>
        <div className="home-actions">
          <button className="btn" onClick={onRefreshMe} disabled={busy}>
            Actualiser
          </button>
        </div>
      </div>

      <div className="profile-strip">
        <div className="avatar-frame" aria-hidden="true">
          <Avatar className="avatar" src={profilePhotoUrl} />
        </div>
        <div className="profile-meta">
          <div className="profile-name">{displayName ?? 'Utilisateur'}</div>
          <div className="profile-line">
            <span className="pill mono">{role ?? '—'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsView({
  settings,
  onSave,
  onClose,
}: {
  settings: AppSettings
  onSave: (s: AppSettings) => void
  onClose: () => void
}) {
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl)
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>Paramètres</div>
        <button className="btn" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="grid">
        <div className="field">
          <div className="label">URL API</div>
          <input className="input" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
          <div className="mono" style={{ opacity: 0.75 }}>
            Exemple: https://api.mairiedeportdepaix.com
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn primary"
          onClick={() => onSave({ ...settings, apiBaseUrl })}
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}

function HomeLoginView({
  busy,
  onLogin,
}: {
  busy: boolean
  onLogin: (identifier: string, password: string) => Promise<void>
}) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  return (
    <div className="login">
      <div className="card login-card">
        <img className="login-logo" src={assetUrl('mairie-logo.png')} alt="Logo Mairie Port-de-Paix" />
        <div style={{ fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>Bienvenue</div>
        <div className="mono" style={{ opacity: 0.85, textAlign: 'center', marginBottom: 12 }}>
          Veuillez entrer vos identifiants pour accéder au système.
        </div>

        <div className="field" style={{ width: '100%' }}>
          <div className="label">Identifiant (email / téléphone)</div>
          <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </div>
        <div className="field" style={{ width: '100%', marginTop: 10 }}>
          <div className="label">Mot de passe</div>
          <div className="input-with-button">
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              title={showPassword ? 'Masquer' : 'Afficher'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => onLogin(identifier, password)} disabled={busy}>
            Se connecter
          </button>
        </div>
      </div>
    </div>
  )
}

function CrudView({ title, basePath }: { title: string; basePath: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [list, setList] = useState<unknown>(null)
  const [itemId, setItemId] = useState('')
  const [body, setBody] = useState('{\n\n}')

  const doList = async () => {
    setErr(null)
    setBusy(true)
    try {
      setList(await apiFetch(basePath))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doCreate = async () => {
    setErr(null)
    setBusy(true)
    try {
      const payload = JSON.parse(body || '{}')
      const r = await apiFetch(basePath, { method: 'POST', body: JSON.stringify(payload) })
      setList(r)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doPatch = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (!itemId.trim()) throw new Error('ID requis')
      const payload = JSON.parse(body || '{}')
      const r = await apiFetch(`${basePath}/${encodeURIComponent(itemId.trim())}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setList(r)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (!itemId.trim()) throw new Error('ID requis')
      const r = await apiFetch(`${basePath}/${encodeURIComponent(itemId.trim())}`, { method: 'DELETE' })
      setList(r)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div className="row">
          <button className="btn" onClick={doList} disabled={busy}>
            Lister (GET)
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorBox err={err} />
        </div>
      ) : null}

      <div className="grid">
        <div className="field">
          <div className="label">ID (pour PATCH/DELETE)</div>
          <input className="input mono" value={itemId} onChange={(e) => setItemId(e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <div className="label">Body JSON (POST/PATCH)</div>
          <JsonTextarea value={body} onChange={setBody} placeholder='{"example":"value"}' />
          <div className="row">
            <button className="btn primary" onClick={doCreate} disabled={busy}>
              Créer (POST)
            </button>
            <button className="btn" onClick={doPatch} disabled={busy}>
              Modifier (PATCH)
            </button>
            <button className="btn danger" onClick={doDelete} disabled={busy}>
              Supprimer (DELETE)
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label">Résultat</div>
        <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {list ? pretty(list) : '—'}
        </pre>
      </div>
    </div>
  )
}

function DemandesView() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [list, setList] = useState<unknown>(null)
  const [id, setId] = useState('')
  const [statusBody, setStatusBody] = useState('{\n  \"status\": \"\"\n}')

  const doList = async () => {
    setErr(null)
    setBusy(true)
    try {
      setList(await apiFetch('/admin/demandes'))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doGet = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (!id.trim()) throw new Error('ID requis')
      setList(await apiFetch(`/admin/demandes/${encodeURIComponent(id.trim())}`))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doUpdateStatus = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (!id.trim()) throw new Error('ID requis')
      const payload = JSON.parse(statusBody || '{}')
      setList(
        await apiFetch(`/admin/demandes/${encodeURIComponent(id.trim())}/status`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      )
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>Admin Demandes</div>
        <div className="row">
          <button className="btn" onClick={doList} disabled={busy}>
            Lister (GET)
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorBox err={err} />
        </div>
      ) : null}

      <div className="grid">
        <div className="field">
          <div className="label">ID (GET / PATCH status)</div>
          <input className="input mono" value={id} onChange={(e) => setId(e.target.value)} />
          <div className="row">
            <button className="btn" onClick={doGet} disabled={busy}>
              Détails (GET :id)
            </button>
          </div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <div className="label">Body JSON (PATCH :id/status)</div>
          <JsonTextarea value={statusBody} onChange={setStatusBody} />
          <div className="row">
            <button className="btn primary" onClick={doUpdateStatus} disabled={busy}>
              Modifier statut
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label">Résultat</div>
        <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {list ? pretty(list) : '—'}
        </pre>
      </div>
    </div>
  )
}

function RecensementEntitiesView() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [result, setResult] = useState<unknown>(null)

  const [kind, setKind] = useState('')
  const [id, setId] = useState('')
  const [body, setBody] = useState('{\n\n}')

  const listPath = useMemo(() => {
    const q = kind.trim() ? `?kind=${encodeURIComponent(kind.trim())}` : ''
    return `/recensement/entities${q}`
  }, [kind])

  const doList = async () => {
    setErr(null)
    setBusy(true)
    try {
      setResult(await apiFetch(listPath))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doGet = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (!id.trim()) throw new Error('ID requis')
      setResult(await apiFetch(`/recensement/entities/${encodeURIComponent(id.trim())}`))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doCreate = async () => {
    setErr(null)
    setBusy(true)
    try {
      const payload = JSON.parse(body || '{}')
      setResult(
        await apiFetch('/recensement/entities', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      )
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doPatch = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (!id.trim()) throw new Error('ID requis')
      const payload = JSON.parse(body || '{}')
      setResult(
        await apiFetch(`/recensement/entities/${encodeURIComponent(id.trim())}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      )
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (!id.trim()) throw new Error('ID requis')
      setResult(await apiFetch(`/recensement/entities/${encodeURIComponent(id.trim())}`, { method: 'DELETE' }))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>Recensement Entities</div>
        <div className="row">
          <button className="btn" onClick={doList} disabled={busy}>
            Lister (GET)
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorBox err={err} />
        </div>
      ) : null}

      <div className="grid">
        <div className="field">
          <div className="label">Filtre kind (GET /entities?kind=...)</div>
          <input
            className="input mono"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="ex: commercant"
          />
        </div>
        <div className="field">
          <div className="label">ID (GET/PATCH/DELETE /entities/:id)</div>
          <input className="input mono" value={id} onChange={(e) => setId(e.target.value)} />
          <div className="row">
            <button className="btn" onClick={doGet} disabled={busy}>
              Détails (GET :id)
            </button>
          </div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <div className="label">Body JSON (POST/PATCH)</div>
          <JsonTextarea value={body} onChange={setBody} />
          <div className="row">
            <button className="btn primary" onClick={doCreate} disabled={busy}>
              Créer (POST)
            </button>
            <button className="btn" onClick={doPatch} disabled={busy}>
              Modifier (PATCH)
            </button>
            <button className="btn danger" onClick={doDelete} disabled={busy}>
              Supprimer (DELETE)
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label">Résultat</div>
        <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {result ? pretty(result) : '—'}
        </pre>
      </div>
    </div>
  )
}

declare global {
  interface Window {
    mairieDesktop?: {
      version: () => { app: string }
    }
  }
}

