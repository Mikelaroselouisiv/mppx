import React, { useState } from 'react'
import { S3ObjectImage } from './S3ObjectImage'

export function PhotoGallery({
  photoKeys,
  compact,
}: {
  photoKeys: string[]
  /** Vignettes plus petites (modal latéral). */
  compact?: boolean
}) {
  const [lightboxKey, setLightboxKey] = useState<string | null>(null)
  if (!photoKeys.length) {
    return (
      <div className="photo-gallery-empty mono" style={{ opacity: 0.7, fontSize: 13 }}>
        Aucune photo jointe à cette fiche.
      </div>
    )
  }
  return (
    <>
      <div className={compact ? 'photo-gallery photo-gallery--compact' : 'photo-gallery'}>
        {photoKeys.map((key) => (
          <button
            key={key}
            type="button"
            className="photo-gallery-thumb"
            onClick={() => setLightboxKey(key)}
            aria-label="Agrandir la photo"
          >
            <S3ObjectImage objectKey={key} alt="" className="photo-gallery-thumb-img" />
          </button>
        ))}
      </div>
      {lightboxKey ? (
        <div
          className="photo-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Photo agrandie"
          onClick={() => setLightboxKey(null)}
        >
          <button
            type="button"
            className="btn photo-lightbox-close"
            onClick={() => setLightboxKey(null)}
          >
            Fermer
          </button>
          <div
            className="photo-lightbox-frame"
            onClick={(e) => e.stopPropagation()}
          >
            <S3ObjectImage objectKey={lightboxKey} alt="" className="photo-lightbox-img" />
          </div>
        </div>
      ) : null}
    </>
  )
}
