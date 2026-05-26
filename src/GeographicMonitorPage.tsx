import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getUserFacingApiMessage } from './apiErrors'
import { S3ObjectImage } from './components/S3ObjectImage'
import { buildGeoPopupHtml, presignPhotoUrl } from './geo/geoPopup'
import {
  GEO_MONITOR_MODULES,
  loadGeoPointsForModule,
  PORT_DE_PAIX_CENTER,
  type GeoMapPoint,
  type GeoMonitorModuleId,
} from './geo/mapModules'
import { filterRecensementModules, type RecensementModuleId } from './navAccess'

function ErrorBox({ err }: { err: unknown }) {
  if (!err) return null
  return (
    <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Erreur</div>
      <div>{getUserFacingApiMessage(err)}</div>
    </div>
  )
}

function markerStyle(color: string, selected: boolean): L.CircleMarkerOptions {
  return {
    radius: selected ? 11 : 8,
    fillColor: color,
    color: selected ? '#111' : '#fff',
    weight: selected ? 3 : 2,
    fillOpacity: 0.92,
  }
}

function GeoMap({
  points,
  color,
  selectedId,
  onSelect,
}: {
  points: GeoMapPoint[]
  color: string
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const pointsKey = useMemo(
    () => points.map((p) => `${p.id}:${p.latitude}:${p.longitude}`).join('|'),
    [points],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: [PORT_DE_PAIX_CENTER.lat, PORT_DE_PAIX_CENTER.lng],
      zoom: 13,
      scrollWheelZoom: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersRef.current.clear()
    const bounds: L.LatLngExpression[] = []

    for (const p of points) {
      const latlng: L.LatLngExpression = [p.latitude, p.longitude]
      bounds.push(latlng)
      const marker = L.circleMarker(latlng, markerStyle(color, false))
      marker.bindPopup(buildGeoPopupHtml(p, null), {
        className: 'geo-leaflet-popup',
        maxWidth: 280,
        minWidth: 200,
      })
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        onSelectRef.current(p.id)
        void (async () => {
          const imageUrl = p.coverPhotoKey ? await presignPhotoUrl(p.coverPhotoKey) : null
          marker.setPopupContent(buildGeoPopupHtml(p, imageUrl))
          marker.openPopup()
        })()
      })
      marker.addTo(layer)
      markersRef.current.set(p.id, marker)
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 16)
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 16 })
    } else {
      map.setView([PORT_DE_PAIX_CENTER.lat, PORT_DE_PAIX_CENTER.lng], 13)
    }
  }, [pointsKey, color])

  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      marker.setStyle(markerStyle(color, id === selectedId))
    }
    const map = mapRef.current
    if (!map || !selectedId) return
    const hit = points.find((p) => p.id === selectedId)
    if (!hit) return
    const center = map.getCenter()
    const dist = map.distance(center, [hit.latitude, hit.longitude])
    if (dist > 80) {
      map.panTo([hit.latitude, hit.longitude], { animate: true })
    }
  }, [selectedId, color, points])

  return <div ref={containerRef} className="geo-map-canvas" />
}

export function GeographicMonitorPage({
  allowedModules,
}: {
  allowedModules?: RecensementModuleId[] | null
}) {
  const visibleModules = useMemo(
    () => filterRecensementModules(GEO_MONITOR_MODULES, allowedModules ?? null),
    [allowedModules],
  )
  const [moduleId, setModuleId] = useState<GeoMonitorModuleId>(
    () => (visibleModules[0]?.id as GeoMonitorModuleId | undefined) ?? 'PROJET_CONSTRUCTION',
  )
  const [points, setPoints] = useState<GeoMapPoint[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const mod = visibleModules.find((m) => m.id === moduleId) ?? visibleModules[0]!

  useEffect(() => {
    if (!visibleModules.some((m) => m.id === moduleId)) {
      setModuleId((visibleModules[0]?.id as GeoMonitorModuleId | undefined) ?? 'PROJET_CONSTRUCTION')
    }
  }, [visibleModules, moduleId])

  const load = async (id: GeoMonitorModuleId) => {
    setErr(null)
    setBusy(true)
    setSelectedId(null)
    try {
      const r = await loadGeoPointsForModule(id)
      setPoints(r.points)
      setTotalRows(r.total)
    } catch (e) {
      setErr(e)
      setPoints([])
      setTotalRows(0)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(moduleId)
  }, [moduleId])

  const filteredPoints = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return points
    return points.filter((p) => {
      const hay = `${p.label} ${p.numeroDossier ?? ''} ${p.phone ?? ''} ${p.email ?? ''}`.toLowerCase()
      return hay.includes(s)
    })
  }, [points, q])

  const selectedPoint = selectedId ? points.find((p) => p.id === selectedId) : null

  return (
    <div className="card geo-monitor" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="geo-monitor-topbar">
        <div className="geo-monitor-topbar-app">Moniteur géographique</div>
      </div>

      <div className="geo-monitor-body">
        <aside className="geo-monitor-sidebar">
          <div className="geo-monitor-modules">
            {visibleModules.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`geo-monitor-module-btn ${moduleId === m.id ? 'geo-monitor-module-btn--active' : ''}`}
                onClick={() => setModuleId(m.id)}
                disabled={busy}
              >
                <span className="geo-monitor-module-dot" style={{ background: m.color }} />
                <span className="geo-monitor-module-text">
                  <span className="geo-monitor-module-label">{m.label}</span>
                </span>
              </button>
            ))}
          </div>
          {selectedPoint ? (
            <div className="geo-monitor-selection card" style={{ marginTop: 14, padding: 12, boxShadow: 'none' }}>
              {selectedPoint.coverPhotoKey ? (
                <S3ObjectImage
                  objectKey={selectedPoint.coverPhotoKey}
                  alt=""
                  className="geo-monitor-selection-img"
                />
              ) : (
                <div className="geo-monitor-selection-img geo-monitor-selection-img--empty" />
              )}
              <div style={{ fontWeight: 800, marginTop: 10 }}>{selectedPoint.label}</div>
              {selectedPoint.numeroDossier ? (
                <div className="mono" style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                  {selectedPoint.numeroDossier}
                </div>
              ) : null}
              {selectedPoint.phone ? (
                <div className="mono" style={{ fontSize: 13, marginTop: 6 }}>
                  {selectedPoint.phone}
                </div>
              ) : selectedPoint.email ? (
                <div className="mono" style={{ fontSize: 13, marginTop: 6 }}>
                  {selectedPoint.email}
                </div>
              ) : null}
              <button
                type="button"
                className="btn"
                style={{ marginTop: 10, width: '100%' }}
                onClick={() => setSelectedId(null)}
              >
                Désélectionner
              </button>
            </div>
          ) : null}
        </aside>

        <main className="geo-monitor-map-wrap">
          <div className="geo-monitor-map-toolbar">
            <div className="geo-monitor-rubrique-title">
              <span
                className="geo-monitor-module-dot geo-monitor-module-dot--lg"
                style={{ background: mod.color }}
              />
              <h2 className="geo-monitor-rubrique-heading">{mod.label}</h2>
            </div>
            <div className="geo-monitor-map-toolbar-actions">
              <span className="list-toolbar-count mono">
                {busy ? (
                  'Chargement…'
                ) : (
                  <>
                    <strong>{filteredPoints.length}</strong> point{filteredPoints.length === 1 ? '' : 's'}
                    {totalRows > 0 ? (
                      <span style={{ opacity: 0.85 }}>
                        {' '}
                        · {totalRows} fiche{totalRows === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </>
                )}
              </span>
              <input
                className="input mono"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrer les points…"
                style={{ width: 200 }}
              />
              <button type="button" className="btn" disabled={busy} onClick={() => void load(moduleId)}>
                Actualiser
              </button>
            </div>
          </div>
          {err ? <ErrorBox err={err} /> : null}
          <GeoMap
            points={filteredPoints}
            color={mod.color}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </main>
      </div>
    </div>
  )
}
