import { useState } from 'react'
import type { ProductImage as ProductImageData } from '@/types/catalog'
import { ProductImagePlaceholder } from './ProductImagePlaceholder'
import styles from './ProductImage.module.css'

interface ProductImageProps {
  images: ProductImageData[]
  label: string
}

/**
 * Renders a product's primary (or first) image as a real <img>, falling
 * back to ProductImagePlaceholder in two distinct cases that must both
 * keep working:
 *   - `images` is empty — a genuinely imageless product, a real expected
 *     state, not an error.
 *   - the image fails to load (onError) — a bad/expired URL is still a
 *     possible real-world state even though delivery is public now
 *     (fix/atharva/product-image-delivery).
 *
 * Callers should key this component by something that changes when the
 * displayed product changes (e.g. `key={product.id}`) — the load-failure
 * state below is local to this component instance and won't reset on its
 * own if the same instance is reused for a different product's images
 * (e.g. client-side nav between two product detail pages).
 */
export function ProductImage({ images, label }: ProductImageProps) {
  const [failed, setFailed] = useState(false)
  const image = images.find((img) => img.isPrimary) ?? images[0]

  if (!image || failed) {
    return <ProductImagePlaceholder label={label} />
  }

  return (
    <img
      src={image.url}
      alt={label}
      className={styles.image}
      onError={() => setFailed(true)}
    />
  )
}
