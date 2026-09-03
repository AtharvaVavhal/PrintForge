import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import { useStoreName } from '@/hooks/useStoreName'
import styles from './HomeHero.module.css'

/**
 * The default storefront hero, shown when an admin has not configured a
 * promotional carousel (settings.hero_slides). Deliberately neutral and
 * catalogue-oriented — no discounts, delivery promises, or business claims
 * are invented here. If PrintForge wants a promo hero, it is set through
 * the admin control plane and HeroCarousel renders it instead.
 */
export function HomeHero() {
  const storeName = useStoreName()

  return (
    <section className={styles.hero} aria-labelledby="home-hero-heading">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>{storeName}</p>
        <h1 id="home-hero-heading" className={styles.headline}>
          Custom prints, made to order
        </h1>
        <p className={styles.subtext}>
          Browse the catalogue and personalise mugs, apparel, frames and more —
          each item printed for your order.
        </p>
        <div className={styles.actions}>
          <Link to={ROUTES.PRODUCTS} className={styles.ctaLink}>
            <Button>Browse the catalogue</Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
