import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import styles from './CategoryStoryBar.module.css'

export interface StoryCategory {
  id: string
  title: string
  image: string
  href: string
}

export const UVPIXEL_STORIES: StoryCategory[] = [
  {
    id: 'all-products',
    title: 'All Products',
    image: '/images/banners/banner-business-cards.jpg',
    href: ROUTES.PRODUCTS,
  },
  {
    id: 'business-cards',
    title: 'Business Cards',
    image: '/images/products/prod-business-cards.jpg',
    href: `${ROUTES.PRODUCTS}?search=business+cards`,
  },
  {
    id: 'logo-signs',
    title: 'Logo',
    image: '/images/products/prod-logo-sign.jpg',
    href: `${ROUTES.PRODUCTS}?search=logo`,
  },
  {
    id: 'mugs',
    title: 'Mugs',
    image: '/images/products/prod-mugs.jpg',
    href: `${ROUTES.PRODUCTS}?search=mugs`,
  },
  {
    id: 'name-plates',
    title: 'Name Plates',
    image: '/images/products/prod-name-plates.jpg',
    href: `${ROUTES.PRODUCTS}?search=name+plates`,
  },
  {
    id: 't-shirts',
    title: 'T-Shirts',
    image: '/images/products/prod-tshirts.jpg',
    href: `${ROUTES.PRODUCTS}?search=t-shirts`,
  },
]

export function CategoryStoryBar({ stories = UVPIXEL_STORIES }: { stories?: StoryCategory[] }) {
  const trackRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!trackRef.current) return
    const offset = direction === 'left' ? -320 : 320
    trackRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  return (
    <nav className={styles.container} aria-label="Featured category stories">
      <div className={styles.inner}>
        <button
          className={`${styles.scrollBtn} ${styles.scrollBtnLeft}`}
          onClick={() => scroll('left')}
          aria-label="Scroll categories left"
          type="button"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>

        <div className={styles.scrollTrack} ref={trackRef}>
          {stories.map((item) => (
            <Link key={item.id} to={item.href} className={styles.storyItem}>
              <div className={styles.circleWrapper}>
                <img
                  src={item.image}
                  alt={item.title}
                  className={styles.circleImage}
                  loading="lazy"
                />
              </div>
              <span className={styles.title}>{item.title}</span>
            </Link>
          ))}
        </div>

        <button
          className={`${styles.scrollBtn} ${styles.scrollBtnRight}`}
          onClick={() => scroll('right')}
          aria-label="Scroll categories right"
          type="button"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
