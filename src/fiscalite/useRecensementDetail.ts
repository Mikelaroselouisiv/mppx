import { useEffect, useState } from 'react'
import { fetchRecensementDetail } from './fetchRecensementDetail'
import type { FiscalModuleId } from './store'

export function useRecensementDetail(
  moduleId: FiscalModuleId,
  entityId: string | null,
  enabled: boolean,
) {
  const [data, setData] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<unknown>(null)

  useEffect(() => {
    if (!enabled || !entityId) {
      setData(null)
      setLoadErr(null)
      setBusy(false)
      return
    }
    let cancelled = false
    setBusy(true)
    setLoadErr(null)
    void fetchRecensementDetail(moduleId, entityId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadErr(e)
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [moduleId, entityId, enabled])

  return { data, busy, err: loadErr }
}
