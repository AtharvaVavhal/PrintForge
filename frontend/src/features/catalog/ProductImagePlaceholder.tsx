import { ImageOff } from 'lucide-react'
import styles from './ProductImagePlaceholder.module.css'

/**
 * GET /products[/:slug] ships `images[].cloudinaryPublicId` only, never a
 * ready-to-use URL — and every product image is uploaded with Cloudinary's
 * 'authenticated' delivery type (uploads.service.ts hardcodes this for
 * every upload, not just customer customization files), so even a
 * correctly-guessed direct res.cloudinary.com URL would 401. There's also
 * no VITE_CLOUDINARY_CLOUD_NAME yet to build one from. Until the backend
 * computes a signed URL (or switches product images to unsigned 'upload'
 * delivery) there is no working image URL for this frontend to render —
 * this placeholder is deliberate, not a fallback for a rare failure.
 */
export function ProductImagePlaceholder({ label }: { label: string }) {
  return (
    <div className={styles.placeholder} role="img" aria-label={`${label} — no image available`}>
      <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
    </div>
  )
}
