import { Link } from 'react-router-dom'
import { Star, Gift, Eye } from 'lucide-react'
import type { Product } from '@/types/catalog'
import { formatPrice } from '@/utils/formatPrice'
import { productDetailPath } from '@/constants/routes'
import { ProductImage } from './ProductImage'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/utils/cn'
import styles from './ProductCard.module.css'

function getProductFeatures(product: Product): string[] {
  const features: string[] = []

  if (product.specifications && typeof product.specifications === 'object') {
    for (const [, val] of Object.entries(product.specifications)) {
      if (typeof val === 'string' && val.trim()) {
        features.push(val.trim())
      } else if (Array.isArray(val) && val.length > 0) {
        features.push(String(val[0]))
      }
      if (features.length >= 3) break
    }
  }

  if (features.length < 2 && product.variants && product.variants.length > 0) {
    const variantLabels = product.variants.slice(0, 3 - features.length).map((v) => v.label)
    features.push(...variantLabels)
  }

  if (features.length === 0) {
    features.push('Premium High-Def Finish', 'Custom Made to Order')
  }

  return features.slice(0, 3)
}

function getProductTag(product: Product, isUnavailable: boolean): string {
  if (isUnavailable) return 'Unavailable'
  if (product.customizationFields && product.customizationFields.length > 0) {
    return 'Customizable'
  }
  const ratingNum = Number(product.avgRating) || 0
  if (ratingNum >= 4.9 || product.reviewCount > 50) return 'Bestseller'
  if (product.variants && product.variants.length > 2) return 'Popular'
  return 'Verified'
}

export function ProductCard({
  product,
  onQuickView,
  headingLevel = 3,
}: {
  product: Product
  onQuickView?: (slug: string) => void
  /** Heading level for the product name (UX-14). Default 3 — correct under
   * a rail's <h2> SectionHeading. The listing page passes 2, where product
   * names sit directly under the page <h1>. */
  headingLevel?: 2 | 3
}) {
  const NameHeading = headingLevel === 2 ? 'h2' : 'h3'
  const isUnavailable =
    product.variants.length > 0 && product.variants.every((v) => !v.isAvailable)

  const features = getProductFeatures(product)
  const tagText = getProductTag(product, isUnavailable)

  // Calculate original price and discount
  const basePriceNum = Number(product.basePrice) || 0
  const originalPriceNum = Math.round((basePriceNum * 1.6) / 10) * 10 || (basePriceNum + 200)
  const originalPriceFormatted = formatPrice(originalPriceNum)

  // Rating display
  const ratingVal = product.avgRating ? Number(product.avgRating).toFixed(1) : '4.9'
  const reviewCount = product.reviewCount > 0 ? product.reviewCount : 54

  return (
    <article className={cn(styles.card, isUnavailable && styles.unavailable)}>
      <div className={styles.imageWrapper}>
        <Link to={productDetailPath(product.slug)} className={styles.imageLink} aria-label={product.name}>
          <ProductImage key={product.id} images={product.images} label={product.name} />
        </Link>

        <div className={styles.badgeGroup}>
          <span className={cn(styles.tagBadge, isUnavailable && styles.unavailableTag)}>
            {tagText}
          </span>
          {!isUnavailable && <span className={styles.discountBadge}>40% OFF</span>}
        </div>

        {onQuickView && (
          <IconButton
            className={styles.quickViewBtn}
            aria-label={`Quick view for ${product.name}`}
            onClick={() => onQuickView(product.slug)}
            size="md"
            variant="ghost"
          >
            <Eye size={18} aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.ratingRow}>
          <span className={styles.starIcon} aria-hidden="true">
            <Star size={13} fill="#f59e0b" color="#f59e0b" />
          </span>
          <span className={styles.ratingVal}>{ratingVal}</span>
          <span className={styles.reviewCount}>({reviewCount})</span>
        </div>

        <Link to={productDetailPath(product.slug)} className={styles.nameLink}>
          <NameHeading className={styles.name}>{product.name}</NameHeading>
        </Link>

        {features.length > 0 && (
          <div className={styles.featuresList}>
            {features.map((feat, idx) => (
              <span key={idx} className={styles.featureItem}>
                <span className={styles.featureDot} />
                {feat}
              </span>
            ))}
          </div>
        )}

        <div className={styles.priceRow}>
          <span className={styles.salePrice}>
            {product.variants.length > 0 ? 'From ' : ''}
            {formatPrice(product.basePrice)}
          </span>
          <span className={styles.originalPrice}>{originalPriceFormatted}</span>
          <span className={styles.savePercent}>40% Off</span>
        </div>

        <Link to={productDetailPath(product.slug)} className={styles.shopButton}>
          <Gift size={15} aria-hidden="true" />
          <span>Personalize Now</span>
        </Link>
      </div>
    </article>
  )
}
