import { Link } from 'react-router-dom'
import type { Product } from '@/types/catalog'
import { formatPrice } from '@/utils/formatPrice'
import { productDetailPath } from '@/constants/routes'
import { ProductImage } from './ProductImage'
import styles from './ProductCard.module.css'

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={productDetailPath(product.slug)} className={styles.card}>
      <ProductImage key={product.id} images={product.images} label={product.name} />
      <div className={styles.body}>
        <h3 className={styles.name}>{product.name}</h3>
        <p className={styles.price}>
          {product.variants.length > 0 ? 'From ' : ''}
          {formatPrice(product.basePrice)}
        </p>
      </div>
    </Link>
  )
}
