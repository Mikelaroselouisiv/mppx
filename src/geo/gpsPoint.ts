export type GpsCoords = {
  latitude: number
  longitude: number
  accuracy?: number | null
}

/** Extrait lat/lng depuis `gpsPoint` API (ou champs plats éventuels). */
export function gpsFromRaw(raw: unknown): GpsCoords | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  let lat = NaN
  let lng = NaN
  const g = o.gpsPoint ?? o.gps_point
  if (g && typeof g === 'object') {
    const gp = g as Record<string, unknown>
    lat = Number(gp.latitude)
    lng = Number(gp.longitude)
  } else {
    lat = Number(o.gpsLatitude ?? o.gps_latitude ?? o.latitude)
    lng = Number(o.gpsLongitude ?? o.gps_longitude ?? o.longitude)
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const accRaw = (g && typeof g === 'object' ? (g as Record<string, unknown>).accuracy : null) ?? o.gpsAccuracy
  const acc = accRaw != null ? Number(accRaw) : NaN
  return {
    latitude: lat,
    longitude: lng,
    accuracy: Number.isFinite(acc) && acc >= 0 ? acc : null,
  }
}
