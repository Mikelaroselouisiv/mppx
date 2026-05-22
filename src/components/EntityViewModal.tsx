import React, { useMemo } from 'react'
import { RecensementDetailSheet } from '../fiscalite/RecensementDetailSheet'
import { photoKeysFromRaw } from '../fiscalite/photoUtils'
import { PhotoGallery } from './PhotoGallery'

export function EntityViewModal({
  open,
  title,
  subtitle,
  detailData,
  detailBusy,
  detailErr,
  detailTitle = 'Informations',
  canWrite,
  onClose,
  onEdit,
  onDelete,
  deleteBusy,
  children,
  modalWidth = 920,
}: {
  open: boolean
  title: string
  subtitle?: string | null
  detailData: unknown
  detailBusy?: boolean
  detailErr?: unknown
  detailTitle?: string
  canWrite?: boolean
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
  deleteBusy?: boolean
  children?: React.ReactNode
  modalWidth?: number
}) {
  const photoKeys = useMemo(() => photoKeysFromRaw((detailData as any)?.photos), [detailData])

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: modalWidth, maxWidth: '96vw' }}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 900 }}>{title}</div>
            {subtitle ? (
              <div className="mono" style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="modal-body">
          <div className="entity-view-photos">
            <div className="label" style={{ marginBottom: 8 }}>
              Photos
            </div>
            <PhotoGallery photoKeys={photoKeys} />
          </div>
          <RecensementDetailSheet
            title={detailTitle}
            busy={!!detailBusy}
            err={detailErr}
            data={detailData}
            style={{ marginTop: 16, marginBottom: children ? 16 : 0 }}
          />
          {children}
        </div>
        <div className="modal-footer">
          {canWrite && onDelete ? (
            <button
              type="button"
              className="btn danger"
              onClick={onDelete}
              disabled={deleteBusy}
              style={{ marginRight: 'auto' }}
            >
              Supprimer
            </button>
          ) : (
            <span style={{ marginRight: 'auto' }} />
          )}
          <button type="button" className="btn" onClick={onClose} disabled={deleteBusy}>
            Fermer
          </button>
          {canWrite && onEdit ? (
            <button type="button" className="btn primary" onClick={onEdit} disabled={deleteBusy}>
              Modifier
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
