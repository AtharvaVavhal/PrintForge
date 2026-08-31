import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import type { Product } from '@/types/catalog'
import { formatPrice } from '@/utils/formatPrice'
import { productDetailPath } from '@/constants/routes'
import { StarRating } from '@/features/reviews/StarRating'
import { ProductImage } from './ProductImage'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/utils/cn'
import styles from './ProductCard.module.css'

export function ProductCard({ product, onQuickView }: { product: Product; onQuickView?: (slug: string) => void }) {
  const variantPills = product.variants.slice(0, 4).map((v) => v.label);
  const hasMoreVariants = product.variants.length > 4;

  return (
    <article className={styles.card}>
      <div className={styles.imageWrapper}>
        <Link to={productDetailPath(product.slug)} className={styles.imageLink} aria-label={product.name}>
          <ProductImage key={product.id} images={product.images} label={product.name} />
        </Link>
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
        <Link to={productDetailPath(product.slug)} className={styles.nameLink}>
          <h3 className={styles.name}>{product.name}</h3>
        </Link>
        <StarRating avgRating={product.avgRating} reviewCount={product.reviewCount} compact />
        <p className={styles.price}>
          {product.variants.length > 0 ? 'From ' : ''}
          {formatPrice(product.basePrice)}
        </p>

        {(variantPills.length > 0) && (
          <div className={styles.swatches} role="list" aria-label="Available variants">
            {variantPills.map((label, idx) => (
              <span key={idx} className={styles.swatchPill}>{label}</span>
            ))}
            {hasMoreVariants && (
              <span className={cn(styles.swatchPill, styles.more)}>+{product.variants.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
