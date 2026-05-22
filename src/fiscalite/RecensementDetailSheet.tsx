import React, { useMemo } from 'react'
import { buildRecensementDetailRows } from './recensementDetailRows'

export function RecensementDetailSheet({
  title = 'Fiche recensement',
  busy,
  err,
  data,
  style,
}: {
  title?: string
  busy: boolean
  err: unknown
  data: unknown
  style?: React.CSSProperties
}) {
  const rows = useMemo(() => buildRecensementDetailRows(data), [data])

  return (
    <div
      className="card"
      style={{
        padding: 12,
        background: 'var(--panel)',
        boxShadow: 'none',
        ...style,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      {busy ? (
        <div className="mono" style={{ opacity: 0.8 }}>
          Chargement de la fiche…
        </div>
      ) : null}
      {err ? (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>
          {err instanceof Error ? err.message : String(err)}
        </div>
      ) : null}
      {!busy && !err && rows.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '10px 18px',
            maxHeight: 380,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`} style={{ minWidth: 0 }}>
              <div className="label">{r.label}</div>
              <div className="mono" style={{ fontSize: 12, lineHeight: 1.45, wordBreak: 'break-word' }}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!busy && !err && !rows.length && data ? (
        <div className="mono" style={{ opacity: 0.75, fontSize: 12 }}>
          Fiche reçue mais aucun champ affichable.
        </div>
      ) : null}
    </div>
  )
}
