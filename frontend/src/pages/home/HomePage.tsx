import { HomeHero } from '@/components/home/HomeHero'
import { BannerGrid } from '@/components/home/BannerGrid'
import { CategoryShowcase } from '@/components/home/CategoryShowcase'
import { CategoryRail } from '@/components/home/CategoryRail'
import { CategoryProductRails } from '@/components/home/CategoryProductRails'
import { ProductRail } from '@/components/home/ProductRail'
import { TrustStrip } from '@/components/home/TrustStrip'
import { Faq } from '@/components/home/Faq'
import { useHomepageSettings } from '@/hooks/useHomepageSettings'
import { ROUTES } from '@/constants/routes'
import { Seo } from '@/seo/Seo'
import { websiteJsonLd } from '@/seo/jsonLd'
import { useSiteOrigin } from '@/features/store-context/useSiteOrigin'

const HOME_DESCRIPTION =
  'Browse the PrintForge catalogue and personalise mugs, apparel, frames and more — each item printed for your order.'

/**
 * RECONSTRUCTED FILE — not the recovered original.
 *
 * The Phase 13.6 source of this file was destroyed and is unrecoverable from
 * git objects, dangling commits, stashes, editor local history, filesystem
 * backups, Trash, local snapshots or workspace archives. It was rebuilt from
 * two surviving sources:
 *   - `frontend/dist/assets/index-UJ_3obUe.js`, the pre-loss production bundle,
 *     whose compiled `HomePage` fixed the component set, render order,
 *     conditionals, every literal prop and this description string;
 *   - `HomePage.test.tsx`, the behavioural contract, unmodified.
 * Comments and import order are therefore this reconstruction's, not the
 * original's; everything the compiled output pinned down is reproduced exactly.
 *
 * Composition only — every section owns its own data, styling and empty/error
 * handling, which is why this page has no stylesheet of its own (Phase 13.6
 * deleted `HomePage.module.css`) and no loading state: `HomeHero` renders
 * immediately so the page never shows a skeleton above the fold.
 *
 * `hero_slides` is deliberately NOT read. The rotating `HeroCarousel` is
 * retired: the static hero is always what renders, so a configured (or
 * malformed) slide list can neither introduce a second `<h1>` nor replace the
 * neutral headline.
 *
 * Nothing here invents catalogue or marketing content. The two settings-driven
 * sections appear only when an operator has configured them, the rails come
 * straight from `GET /products` and omit themselves on error, and there are no
 * testimonials, newsletter or delivery/discount promises (see the
 * content-integrity cases in `HomePage.test.tsx`).
 */
export function HomePage() {
  const siteOrigin = useSiteOrigin()
  const { data: settings } = useHomepageSettings()

  const banners = settings?.banners ?? []
  const showcaseCategories = settings?.showcase_categories ?? []

  return (
    <>
      <Seo
        title=""
        description={HOME_DESCRIPTION}
        canonicalPath="/"
        jsonLd={websiteJsonLd(siteOrigin)}
      />
      <HomeHero />
      {banners.length > 0 && <BannerGrid banners={banners} />}
      {showcaseCategories.length > 0 && (
        <CategoryShowcase categories={showcaseCategories} />
      )}
      <CategoryRail />
      <CategoryProductRails />
      <ProductRail
        id="home-new-arrivals-heading"
        title="New arrivals"
        params={{ sort: 'newest' }}
        viewAllHref={`${ROUTES.PRODUCTS}?sort=newest`}
      />
      <ProductRail
        id="home-top-rated-heading"
        title="Top rated"
        params={{ sort: 'rating_desc', minRating: 4 }}
        viewAllHref={`${ROUTES.PRODUCTS}?sort=rating_desc`}
      />
      <TrustStrip />
      <Faq />
    </>
  )
}
