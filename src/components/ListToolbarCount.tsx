import React from 'react'

export function ListToolbarCount({
  total,
  filtered,
  busy,
  singular = 'enregistré',
  plural = 'enregistrés',
}: {
  total: number
  filtered?: number
  busy?: boolean
  singular?: string
  plural?: string
}) {
  if (busy) {
    return <span className="list-toolbar-count mono">Chargement…</span>
  }
  const label = total === 1 ? singular : plural
  const hasFilter = filtered != null && filtered !== total
  return (
    <span className="list-toolbar-count mono" title="Nombre de fiches enregistrées">
      {hasFilter ? (
        <>
          <strong>{filtered}</strong> affiché{filtered === 1 ? '' : 's'} sur <strong>{total}</strong> {label}
        </>
      ) : (
        <>
          <strong>{total}</strong> {label}
        </>
      )}
    </span>
  )
}
