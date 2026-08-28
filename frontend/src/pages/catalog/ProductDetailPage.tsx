import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/hooks/useProduct'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatPrice } from '@/utils/formatPrice'
import { ROUTES } from '@/constants/routes'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { ProductImage } from '@/features/catalog/ProductImage'
import { VariantSelector } from '@/features/cart/VariantSelector'
import { AddToCartControls } from '@/features/cart/AddToCartControls'
import {
  CustomizationForm,
  type CustomizationFormState,
} from '@/features/customization/CustomizationForm'
import { StarRating } from '@/features/reviews/StarRating'
import { ReviewList } from '@/features/reviews/ReviewList'
import styles from './ProductDetailPage.module.css'

const EMPTY_CUSTOMIZATION_STATE: CustomizationFormState = {
  values: [],
  surcharge: 0,
  isValid: true,
}

/** Renders the product's own data — variants, images, specifications —
 * plus the Phase 3 customization form and, since Phase 4, real variant
 * selection and the actual Add to Cart request (features/cart). The price
 * shown here (base + selected variant's priceDelta + customization
 * surcharge) is a client-side preview only — the authoritative
 * unitPrice/lineTotal for whatever ends up in the cart is always whatever
 * GET /cart (or the add-to-cart response) returns, never this number. */
export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: product, isPending, isError, error } = useProduct(slug)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [customization, setCustomization] = useState<CustomizationFormState>(
    EMPTY_CUSTOMIZATION_STATE,
  )

  const handleCustomizationChange = useCallback((state: CustomizationFormState) => {
    setCustomization(state)
  }, [])

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

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId)
  const total =
    Number(product.basePrice) + Number(selectedVariant?.priceDelta ?? 0) + customization.surcharge

  return (
    <section className={styles.wrap}>
      <div className={styles.gallery}>
        <ProductImage key={product.id} images={product.images} label={product.name} />
      </div>

      <div className={styles.info}>
        <h1>{product.name}</h1>
        <StarRating avgRating={product.avgRating} reviewCount={product.reviewCount} />
        <p className={styles.price}>{formatPrice(total)}</p>
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
          <VariantSelector
            variants={product.variants}
            selectedVariantId={selectedVariantId}
            onChange={setSelectedVariantId}
          />
        )}

        <CustomizationForm
          fields={product.customizationFields}
          onChange={handleCustomizationChange}
        />

        <AddToCartControls
          product={product}
          selectedVariantId={selectedVariantId}
          customization={customization}
        />
      </div>

      <div className={styles.reviews}>
        <ReviewList productId={product.id} />
      </div>
    </section>
  )
}
