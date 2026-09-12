import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import type { CoreCategoryData } from './categoryData'
import styles from './CategoryHeroBanner.module.css'

interface CategoryHeroBannerProps {
  data: CoreCategoryData
}

export function CategoryHeroBanner({ data }: CategoryHeroBannerProps) {
  return (
    <div className={styles.bannerWrapper}>
      <div className={styles.bannerImageContainer}>
        <img
          src={data.bannerImg}
          alt={data.bannerAlt}
          className={styles.bannerImg}
          loading="eager"
        />
        <div className={styles.overlay}>
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}>
              <Sparkles size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              {data.eyebrow}
            </span>
            <span className={styles.promoBadge}>{data.badgeText}</span>
          </div>

          <h2 className={styles.heading}>{data.title}</h2>
          <p className={styles.subtext}>{data.subtitle}</p>

          <div className={styles.chipsRow} role="list">
            {data.featureChips.map((chip, idx) => {
              const toUrl = chip.query
                ? `${ROUTES.PRODUCTS}?category=${encodeURIComponent(chip.query)}`
                : ROUTES.PRODUCTS
              const isActive =
                data.key === chip.query ||
                (data.key === 'all' && chip.query === '')
              return (
                <Link
                  key={idx}
                  to={toUrl}
                  className={cn(styles.chip, isActive && styles.chipActive)}
                  role="listitem"
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span>{chip.label}</span>
                  {chip.badge && <span className={styles.chipBadge}>{chip.badge}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
