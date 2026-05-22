import React from 'react'
import type { EntityCardDisplay } from '../fiscalite/entityCardFields'
import { S3ObjectImage } from './S3ObjectImage'

export function RecensementEntityCard({
  display,
  meta,
  onClick,
  title,
}: {
  display: EntityCardDisplay
  meta?: React.ReactNode
  onClick: () => void
  title?: string
}) {
  const { numeroDossier, primaryName, subtitle, phone, email, coverPhotoKey } = display
  return (
    <button
      type="button"
      className="entity-card"
      onClick={onClick}
      title={title ?? primaryName}
    >
      <div className="entity-card-cover">
        {coverPhotoKey ? (
          <S3ObjectImage
            objectKey={coverPhotoKey}
            alt=""
            className="entity-card-cover-img"
          />
        ) : (
          <div className="entity-card-cover-placeholder" aria-hidden>
            <span className="entity-card-cover-icon">◇</span>
          </div>
        )}
      </div>
      <div className="entity-card-body">
        {numeroDossier ? (
          <div className="entity-card-dossier mono">{numeroDossier}</div>
        ) : null}
        <div className="entity-card-name">{primaryName}</div>
        {subtitle ? <div className="entity-card-sub">{subtitle}</div> : null}
        <div className="entity-card-contacts">
          {phone ? (
            <span className="pill pill--compact mono pill--neutral" title="Téléphone">
              {phone}
            </span>
          ) : null}
          {email ? (
            <span className="pill pill--compact mono pill--neutral" title="Courriel">
              {email}
            </span>
          ) : null}
        </div>
        {meta ? <div className="entity-card-meta">{meta}</div> : null}
      </div>
    </button>
  )
}
