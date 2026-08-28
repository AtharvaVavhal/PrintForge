import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useCategories } from '@/hooks/useCategories'
import { useProducts } from '@/hooks/useProducts'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import { ProductCard } from '@/features/catalog/ProductCard'
import { ProductGridSkeleton } from '@/features/catalog/ProductGridSkeleton'
import gridStyles from '@/features/catalog/ProductGrid.module.css'
import { TrustBar } from '@/features/home/TrustBar'
import { CategoryGrid } from '@/features/home/CategoryGrid'
import { HowItWorks } from '@/features/home/HowItWorks'
import styles from './HomePage.module.css'

const RAIL_LIMIT = 8

export function HomePage() {
  const { status, user } = useAuth()
  const categoriesQuery = useCategories()
  /** No categoryId/search filter — the raw first page, ordered newest-first
   * (products.service.ts's listProducts() orderBy: createdAt desc), same
   * as ProductListPage's default. That ordering is genuinely "new
   * arrivals", not a relabeled "bestsellers" — there's no sales-ranking
   * data to back that claim, so this section is titled accordingly. */
  const productsQuery = useProducts({ limit: RAIL_LIMIT })

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Custom prints, made to order.</h1>
          <p className={styles.subtitle}>
            {status === 'authenticated' && user
              ? `Welcome back, ${user.email}. Browse the catalog to get started.`
              : 'Create an account, browse the catalog, and order custom prints.'}
          </p>

          <div className={styles.actions}>
            <Link to={ROUTES.PRODUCTS}>
              <Button>Browse the shop</Button>
            </Link>
            {status === 'unauthenticated' && (
              <>
                <Link to={ROUTES.REGISTER}>
                  <Button variant="secondary">Create an account</Button>
                </Link>
                <Link to={ROUTES.LOGIN}>
                  <Button variant="ghost">Log in</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <TrustBar />

      {categoriesQuery.data && categoriesQuery.data.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Shop by category</h2>
          <CategoryGrid categories={categoriesQuery.data} />
        </section>
      )}

      {(productsQuery.isPending || (productsQuery.data && productsQuery.data.items.length > 0)) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>New arrivals</h2>
          {productsQuery.isPending ? (
            <ProductGridSkeleton />
          ) : (
            <div className={gridStyles.grid}>
              {productsQuery.data?.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <HowItWorks />
      </section>
    </>
  )
}
