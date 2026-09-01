import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import { Link } from 'react-router-dom'
import { HeroCarousel } from '@/components/home/HeroCarousel'
import { BannerGrid } from '@/components/home/BannerGrid'
import { CategoryShowcase } from '@/components/home/CategoryShowcase'
import { useHomepageSettings } from '@/hooks/useHomepageSettings'
import { Skeleton } from '@/components/ui/Skeleton'
import styles from './HomePage.module.css'

export function HomePage() {
  const { status } = useAuth()
  const { data: settings, isLoading, isError } = useHomepageSettings()

  if (isError) {
    return (
      <section className={styles.fallback}>
        <div className={styles.fallbackInner}>
          <h1>Welcome to PrintForge</h1>
          <p>Custom prints, made to order.</p>
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
    )
  }

  const heroSlides = settings?.hero_slides ?? []
  const banners = settings?.banners ?? []
  const showcaseCategories = settings?.showcase_categories ?? []

  return (
    <>
      {isLoading && heroSlides.length === 0 && (
        <div className={styles.heroSkeleton} aria-busy="true" aria-label="Loading hero">
          <Skeleton className={styles.skeletonSlide} />
        </div>
      )}

      {heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />}

      {banners.length > 0 && <BannerGrid banners={banners} />}

      {showcaseCategories.length > 0 && <CategoryShowcase categories={showcaseCategories} />}

      {!heroSlides.length && status === 'unauthenticated' && (
        <section className={styles.fallbackCTA}>
          <div className={styles.fallbackInner}>
            <h2>Create custom prints</h2>
            <p>Design your own mugs, t-shirts, photo frames, and more.</p>
            <div className={styles.actions}>
              <Link to={ROUTES.PRODUCTS}>
                <Button>Start designing</Button>
              </Link>
              <Link to={ROUTES.REGISTER}>
                <Button variant="secondary">Create an account</Button>
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
