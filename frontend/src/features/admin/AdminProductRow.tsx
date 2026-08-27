import { Link } from 'react-router-dom'
import type { Product } from '@/types/catalog'
import { adminProductDetailPath } from '@/constants/routes'
import { formatPrice } from '@/utils/formatPrice'
import styles from './AdminProductRow.module.css'

interface AdminProductRowProps {
  product: Product
}

/**
 * Links into AdminProductDetailPage with the full product object in
 * router state — there is no GET /products/:id to refetch from on that
 * page, so the row click has to hand over what it already has (GET
 * /products already includes the full nested variants/images/
 * customizationFields per row). See AdminProductsPage's doc comment for
 * why.
 */
export function AdminProductRow({ product }: AdminProductRowProps) {
  return (
    <Link to={adminProductDetailPath(product.id)} state={{ product }} className={styles.row}>
      <div className={styles.primary}>
        <span className={styles.name}>{product.name}</span>
        <span className={styles.slug}>{product.slug}</span>
      </div>
      {!product.isActive && <span className={styles.flag}>Inactive</span>}
      <span className={styles.variantCount}>
        {product.variants.length} {product.variants.length === 1 ? 'variant' : 'variants'}
      </span>
      <span className={styles.price}>{formatPrice(product.basePrice)}</span>
    </Link>
  )
}
