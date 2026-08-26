import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/hooks/useProduct'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatPrice } from '@/utils/formatPrice'
import { ROUTES } from '@/constants/routes'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { ProductImagePlaceholder } from '@/features/catalog/ProductImagePlaceholder'
import styles from './ProductDetailPage.module.css'

/** Renders the product's own data only — variants, images,
 * specifications. The customization form (customizationFields) is
 * Phase 3's job; this page reads that data's real shape (types/catalog.ts)
 * but doesn't render it as a form. */
export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: product, isPending, isError, error } = useProduct(slug)

  if (isPending) {
    return (
      <section className={styles.wrap}>
        <Skeleton className={styles.imageSkeleton} />
        <div className={styles.infoSkeleton}>
          <Skeleton className={styles.titleSkeleton} />
          <Skeleton className={styles.priceSkeleton} />
        </div>
      </section>
    )
  }

  if (isError) {
    return (
      <section className={styles.wrap}>
        <Alert variant="error">{getApiErrorMessage(error)}</Alert>
        <p className={styles.backLink}>
          <Link to={ROUTES.PRODUCTS}>Back to shop</Link>
        </p>
      </section>
    )
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.gallery}>
        <ProductImagePlaceholder label={product.name} />
      </div>

      <div className={styles.info}>
        <h1>{product.name}</h1>
        <p className={styles.price}>{formatPrice(product.basePrice)}</p>
        <p className={styles.quantityRange}>
          {product.maxQuantity
            ? `Order ${product.minQuantity}–${product.maxQuantity} at a time`
            : `Minimum order quantity: ${product.minQuantity}`}
        </p>

        {product.specifications && Object.keys(product.specifications).length > 0 && (
          <dl className={styles.specs}>
            {Object.entries(product.specifications).map(([key, value]) => (
              <div key={key} className={styles.specRow}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}

        {product.variants.length > 0 && (
          <div className={styles.variants}>
            <h2>Options</h2>
            <ul className={styles.variantList}>
              {product.variants.map((variant) => (
                <li key={variant.id} className={styles.variantRow}>
                  <span>{variant.label}</span>
                  <span className={styles.variantMeta}>
                    {Number(variant.priceDelta) !== 0 &&
                      `+${formatPrice(variant.priceDelta)}`}
                    {!variant.isAvailable && (
                      <span className={styles.unavailable}> · Unavailable</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
