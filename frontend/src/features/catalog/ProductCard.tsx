import { Link } from 'react-router-dom'
import type { Product } from '@/types/catalog'
import { formatPrice } from '@/utils/formatPrice'
import { productDetailPath } from '@/constants/routes'
import { StarRating } from '@/features/reviews/StarRating'
import { ProductImage } from './ProductImage'
import { QuickAddButton } from './QuickAddButton'
import styles from './ProductCard.module.css'

interface ProductCardProps {
  product: Product
  /** Grid-context only (ProductListPage) — the homepage rail and any
   * future non-grid usage opt out by simply not passing this, rather than
   * every consumer having to opt out individually. */
  showQuickAdd?: boolean
}

export function ProductCard({ product, showQuickAdd = false }: ProductCardProps) {
  // cart.service.ts's addItem accepts a null variantId even when the
  // product has variants (no server-side "must pick a variant" rule), but
  // AddToCartControls' own UX treats a variant as required once any exist
  // — quick-add matches that same product decision rather than silently
  // adding a mis-configured line. Required customization fields, unlike
  // variants, ARE server-enforced (validateCustomizationsForWrite throws
  // 400 on a missing required value) and there's no inline UI here to
  // supply one, so those are excluded outright, not just by convention.
  const canQuickAdd =
    showQuickAdd &&
    product.variants.length === 0 &&
    !product.customizationFields.some((field) => field.isRequired)

  return (
    <div className={styles.card}>
      <Link to={productDetailPath(product.slug)} className={styles.cardLink}>
        <ProductImage key={product.id} images={product.images} label={product.name} />
        <div className={styles.body}>
          <h3 className={styles.name}>{product.name}</h3>
          <StarRating avgRating={product.avgRating} reviewCount={product.reviewCount} compact />
          <p className={styles.price}>
            {product.variants.length > 0 ? 'From ' : ''}
            {formatPrice(product.basePrice)}
          </p>
        </div>
      </Link>
      {canQuickAdd && <QuickAddButton product={product} />}
    </div>
  )
}
