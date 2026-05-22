import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

export function S3ObjectImage({
  objectKey,
  alt,
  className,
  style,
}: {
  objectKey: string
  alt?: string
  className?: string
  style?: React.CSSProperties
}) {
  const [resolved, setResolved] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const key = objectKey.trim()
    if (!key) {
      setResolved(null)
      return () => {
        alive = false
      }
    }
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
    return () => {
      alive = false
    }
  }, [objectKey])
  if (resolved) {
    return <img className={className} style={style} src={resolved} alt={alt ?? ''} />
  }
  return (
    <div
      className={className}
      style={{
        ...style,
        background: 'rgba(0,0,0,0.06)',
        minWidth: 56,
        minHeight: 56,
      }}
      aria-hidden
    />
  )
}
