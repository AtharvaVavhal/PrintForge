import { useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import styles from './CategoryStoryBar.module.css'

export interface StoryCategory {
  id: string
  title: string
  image: string
  video?: string
  href: string
}

export const UVPIXEL_STORIES: StoryCategory[] = [
  {
    id: 'all-products',
    title: 'All Products',
    image: '/images/products/store/nameplate-mukund-villa.jpg',
    video: '/videos/categories/all-products.webm',
    href: ROUTES.PRODUCTS,
  },
  {
    id: 'business-cards',
    title: 'Business Cards',
    image: '/images/products/store/bcard-blue-gold-premium.jpg',
    video: '/videos/categories/business-cards.webm',
    href: `${ROUTES.PRODUCTS}?category=business-cards`,
  },
  {
    id: 'logo-signs',
    title: 'Logo',
    image: '/images/products/store/logo-iphone-led-sign.jpg',
    video: '/videos/categories/logo.webm',
    href: `${ROUTES.PRODUCTS}?category=logo`,
  },
  {
    id: 'mugs',
    title: 'Mugs',
    image: '/images/products/store/mug-classic-photo-memory.jpg',
    video: '/videos/categories/mugs.webm',
    href: `${ROUTES.PRODUCTS}?category=mugs`,
  },
  {
    id: 'name-plates',
    title: 'Name Plates',
    image: '/images/products/store/nameplate-flat-104.jpg',
    video: '/videos/categories/name-plates.webm',
    href: `${ROUTES.PRODUCTS}?category=name-plates`,
  },
  {
    id: 't-shirts',
    title: 'T-Shirts',
    image: '/images/products/store/tshirt-hustle-graffiti.jpg',
    video: '/videos/categories/t-shirts.webm',
    href: `${ROUTES.PRODUCTS}?category=t-shirts`,
  },
]

function StoryCircle({ item }: { item: StoryCategory }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.defaultMuted = true
    video.muted = true
    const playPromise = video.play()
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay may be delayed until first user interaction on some browsers
      })
    }
  }, [])

  return (
    <div className={styles.circleWrapper}>
      <div className={styles.circleInner}>
        {item.video ? (
          <video
            ref={videoRef}
            src={item.video}
            poster={item.image}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className={styles.circleVideo}
            aria-label={`${item.title} preview video`}
          />
        ) : (
          <img
            src={item.image}
            alt={item.title}
            className={styles.circleImage}
            loading="lazy"
          />
        )}
        <div className={styles.playBadge} aria-hidden="true">
          <Play size={10} fill="currentColor" />
        </div>
      </div>
    </div>
  )
}

export function CategoryStoryBar({ stories = UVPIXEL_STORIES }: { stories?: StoryCategory[] }) {
  const trackRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!trackRef.current) return
    const offset = direction === 'left' ? -340 : 340
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
              <StoryCircle item={item} />
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
