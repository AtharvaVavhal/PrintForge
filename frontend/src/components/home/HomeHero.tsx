import { Link } from 'react-router-dom'
import { FileCheck, Sparkles, Clock, ShieldCheck, ArrowRight, Palette, Layers } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import { useStoreName } from '@/hooks/useStoreName'
import styles from './HomeHero.module.css'

const HIGHLIGHTS = [
  { icon: FileCheck, label: 'Free digital proof check' },
  { icon: Sparkles, label: 'Studio-grade materials' },
  { icon: Clock, label: 'Made to order (48-72h)' },
  { icon: ShieldCheck, label: 'Satisfaction guarantee' },
] as const

const QUICK_STATS = [
  { label: 'Fast Turnaround', val: '48–72h' },
  { label: 'Print Precision', val: 'CMYK+' },
  { label: 'Proof Verified', val: '100%' },
] as const

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
        <div className={styles.split}>
          <div className={styles.contentCol}>
            <p className={styles.eyebrow}>{storeName}</p>
            <h1 id="home-hero-heading" className={styles.headline}>
              Custom prints, made to order
            </h1>
            <p className={styles.subtext}>
              Browse the catalogue and personalize mugs, apparel, frames and more —
              each item printed for your order.
            </p>
            <div className={styles.actions}>
              <Link to={ROUTES.PRODUCTS} className={styles.ctaLink}>
                <Button>Browse the catalogue</Button>
              </Link>
              <a href="#home-categories-heading" className={styles.exploreLink}>
                <span>Explore categories</span>
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>

            <div className={styles.statsRow}>
              {QUICK_STATS.map((s) => (
                <div key={s.label} className={styles.statItem}>
                  <span className={styles.statVal}>{s.val}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.stageCol} aria-hidden="true">
            <div className={styles.stageCard}>
              <div className={styles.stageBadgeTop}>
                <Palette size={14} className={styles.stageBadgeIcon} />
                <span>Studio Customizer</span>
              </div>

              <div className={styles.graphicStage}>
                {/* Ceramic Mug Mockup */}
                <div className={styles.mugMockup}>
                  <div className={styles.mugHandle} />
                  <div className={styles.mugBody}>
                    <div className={styles.mugPrintZone}>
                      <span className={styles.mugPrintText}>YOUR DESIGN</span>
                      <span className={styles.mugPrintSub}>STUDIO PRINT</span>
                    </div>
                  </div>
                </div>

                {/* Gold Foil Business Card Mockup */}
                <div className={styles.cardMockup}>
                  <div className={styles.cardFoilEmblem} />
                  <div className={styles.cardLineLong} />
                  <div className={styles.cardLineShort} />
                  <span className={styles.cardTag}>350 GSM GOLD FOIL</span>
                </div>

                {/* Acrylic Nameplate Mockup */}
                <div className={styles.plateMockup}>
                  <div className={styles.plateScrews}>
                    <span className={styles.screw} />
                    <span className={styles.screw} />
                  </div>
                  <div className={styles.plateText}>ACRYLIC STUDIO</div>
                  <span className={styles.plateBadge}>LASER CUT</span>
                </div>
              </div>

              <div className={styles.stageBadgeBottom}>
                <Layers size={14} className={styles.stageBadgeIcon} />
                <span>Precision Craftsmanship • Made to Order</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.highlightsBar} aria-label="Studio craft highlights">
          {HIGHLIGHTS.map(({ icon: Icon, label }) => (
            <div key={label} className={styles.highlightItem}>
              <Icon size={16} className={styles.highlightIcon} aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
