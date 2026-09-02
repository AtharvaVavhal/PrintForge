import { useMemo, useState } from 'react'
import type { ProductImage as ProductImageData } from '@/types/catalog'
import { ProductImagePlaceholder } from './ProductImagePlaceholder'
import styles from './ProductGallery.module.css'

/**
 * Product-detail image viewer: one large image plus a thumbnail strip when
 * the product has more than one usable image. Images that fail to load are
 * dropped from the set (a real state — a URL can 404/expire); if nothing
 * usable remains it falls back to the shared placeholder. No zoom/lightbox
 * — kept deliberately simple, matching the rest of the storefront.
 */
export function ProductGallery({
  images,
  label,
}: {
  images: ProductImageData[]
  label: string
}) {
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [activeIndex, setActiveIndex] = useState(0)

  const usable = useMemo(() => {
    const ordered = [...images].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.sortOrder - b.sortOrder
    })
    return ordered.filter((img) => img.url && !failedIds.has(img.id))
  }, [images, failedIds])

  if (usable.length === 0) {
    return (
      <div className={styles.main}>
        <ProductImagePlaceholder label={label} />
      </div>
    )
  }

  const safeIndex = Math.min(activeIndex, usable.length - 1)
  const active = usable[safeIndex]

  function markFailed(id: string) {
    setFailedIds((prev) => new Set(prev).add(id))
  }

  return (
    <div className={styles.gallery}>
      <div className={styles.main}>
        <img
          key={active.id}
          src={active.url}
          alt={label}
          className={styles.mainImage}
          onError={() => markFailed(active.id)}
        />
      </div>

      {usable.length > 1 && (
        <ul className={styles.thumbs} aria-label="Product images">
          {usable.map((img, index) => (
            <li key={img.id}>
              <button
                type="button"
                className={styles.thumbButton}
                aria-current={index === safeIndex ? 'true' : undefined}
                aria-label={`Show image ${index + 1} of ${usable.length}`}
                onClick={() => setActiveIndex(index)}
              >
                <img
                  src={img.url}
                  alt=""
                  className={styles.thumbImage}
                  loading="lazy"
                  onError={() => markFailed(img.id)}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
