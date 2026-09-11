import { Link } from 'react-router-dom'
import { Star, ArrowRight, Sparkles, Heart, Gift } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import styles from './OccasionShowcase.module.css'

interface ShowcaseCard {
  id: string
  title: string
  image: string
  salePrice: string
  originalPrice: string
  discount: string
  tag?: string
  rating: string
  reviews: number
  categorySlug: string
  zoom?: boolean
}

const MERCHANDISE_CARDS: ShowcaseCard[] = [
  {
    id: 'merch-tshirt',
    title: 'Custom Logo Round Neck T-Shirt',
    image: '/images/products/prod-tshirts.jpg',
    salePrice: '₹499',
    originalPrice: '₹830',
    discount: '40% OFF',
    tag: 'Bestseller',
    rating: '4.9',
    reviews: 142,
    categorySlug: 't-shirts',
  },
  {
    id: 'merch-bcard',
    title: 'Premium Matte Business Cards (Pack of 100)',
    image: '/images/products/prod-business-cards.jpg',
    salePrice: '₹399',
    originalPrice: '₹665',
    discount: '40% OFF',
    tag: 'Hotselling',
    rating: '5.0',
    reviews: 98,
    categorySlug: 'business cards',
  },
  {
    id: 'merch-mug',
    title: 'Personalized Ceramic Photo Mug',
    image: '/images/products/prod-mugs.jpg',
    salePrice: '₹299',
    originalPrice: '₹499',
    discount: '40% OFF',
    tag: 'Most Loved',
    rating: '4.85',
    reviews: 118,
    categorySlug: 'mugs',
  },
  {
    id: 'merch-nameplate',
    title: 'Designer Acrylic Door Name Plate',
    image: '/images/products/prod-name-plates.jpg',
    salePrice: '₹1,199',
    originalPrice: '₹1,999',
    discount: '40% OFF',
    tag: 'Newly Launched',
    rating: '4.92',
    reviews: 86,
    categorySlug: 'name plates',
  },
]

const BRANDING_CARDS: ShowcaseCard[] = [
  {
    id: 'brand-logo',
    title: '3D Acrylic & LED Business Logo Sign',
    image: '/images/products/prod-logo-sign.jpg',
    salePrice: '₹2,499',
    originalPrice: '₹4,165',
    discount: '40% OFF',
    tag: 'Premium',
    rating: '5.0',
    reviews: 74,
    categorySlug: 'logo',
  },
  {
    id: 'brand-polo',
    title: 'Corporate Embroidered & Printed Polo T-Shirts',
    image: '/images/banners/banner-tshirts-logo.jpg',
    salePrice: '₹699',
    originalPrice: '₹1,165',
    discount: '40% OFF',
    tag: 'Corporate',
    rating: '4.9',
    reviews: 65,
    categorySlug: 't-shirts',
  },
  {
    id: 'brand-nameplate',
    title: 'Executive Metal & Acrylic Desk Name Plate',
    image: '/images/banners/banner-name-plates.jpg',
    salePrice: '₹899',
    originalPrice: '₹1,499',
    discount: '40% OFF',
    tag: 'Bestseller',
    rating: '4.88',
    reviews: 52,
    categorySlug: 'name plates',
  },
  {
    id: 'brand-bcard-foil',
    title: 'Luxury Gold Foil Business Cards (Pack of 100)',
    image: '/images/banners/banner-business-cards.jpg',
    salePrice: '₹599',
    originalPrice: '₹999',
    discount: '40% OFF',
    tag: 'Luxury',
    rating: '4.95',
    reviews: 88,
    categorySlug: 'business cards',
  },
]

interface OccasionShowcaseProps {
  sectionId?: string
}

export function OccasionShowcase({ sectionId }: OccasionShowcaseProps) {
  return (
    <div id={sectionId} className={styles.wrapper}>
      {/* Custom Merchandise Collection */}
      <section className={styles.section} aria-labelledby="merchandise-collection-heading">
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.eyebrow}>
                <Sparkles size={15} className={styles.eyebrowIcon} aria-hidden="true" />
                <span>Custom Merchandise Essentials</span>
              </div>
              <h2 id="merchandise-collection-heading" className={styles.title}>
                Bestselling Custom Prints
              </h2>
              <p className={styles.subtitle}>
                High-definition custom printing on t-shirts, business cards, ceramic mugs, and designer name plates.
              </p>
            </div>
            <Link
              to={`${ROUTES.PRODUCTS}?search=t-shirts`}
              className={styles.viewAllBtn}
            >
              <span>View All Custom Merchandise</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.grid}>
            {MERCHANDISE_CARDS.map((card) => (
              <ProductCraftCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      </section>

      {/* Corporate Branding & Signage Collection */}
      <section className={styles.section} aria-labelledby="branding-signage-heading">
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.eyebrow}>
                <Heart size={15} className={styles.eyebrowIcon} aria-hidden="true" />
                <span>Corporate Identity & Signage</span>
              </div>
              <h2 id="branding-signage-heading" className={styles.title}>
                Corporate Branding & Signs
              </h2>
              <p className={styles.subtitle}>
                Transform your office presence with illuminated 3D logo signs, executive name plates, and branded polo apparel.
              </p>
            </div>
            <Link
              to={`${ROUTES.PRODUCTS}?search=logo`}
              className={styles.viewAllBtn}
            >
              <span>View All Corporate Signage</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.grid}>
            {BRANDING_CARDS.map((card) => (
              <ProductCraftCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function ProductCraftCard({ card }: { card: ShowcaseCard }) {
  return (
    <div className={styles.card}>
      <Link
        to={`${ROUTES.PRODUCTS}?search=${encodeURIComponent(card.categorySlug)}`}
        className={styles.imageLink}
      >
        <div className={styles.imageContainer}>
          <img
            src={card.image}
            alt={card.title}
            className={cn(styles.image, card.zoom && styles.imageZoom)}
            loading="lazy"
          />
          <div className={styles.badgeGroup}>
            {card.tag && <span className={styles.tagBadge}>{card.tag}</span>}
            <span className={styles.discountBadge}>{card.discount}</span>
          </div>
        </div>
      </Link>

      <div className={styles.cardContent}>
        <div className={styles.ratingRow}>
          <span className={styles.starIcon} aria-hidden="true">
            <Star size={13} fill="#f59e0b" color="#f59e0b" />
          </span>
          <span className={styles.ratingVal}>{card.rating}</span>
          <span className={styles.reviewCount}>({card.reviews})</span>
        </div>

        <h3 className={styles.cardTitle}>
          <Link
            to={`${ROUTES.PRODUCTS}?search=${encodeURIComponent(card.categorySlug)}`}
            className={styles.titleLink}
          >
            {card.title}
          </Link>
        </h3>

        <div className={styles.priceRow}>
          <span className={styles.salePrice}>{card.salePrice}</span>
          <span className={styles.originalPrice}>{card.originalPrice}</span>
          <span className={styles.savePercent}>40% Off</span>
        </div>

        <Link
          to={`${ROUTES.PRODUCTS}?search=${encodeURIComponent(card.categorySlug)}`}
          className={styles.shopButton}
        >
          <Gift size={14} aria-hidden="true" />
          <span>Personalize Now</span>
        </Link>
      </div>
    </div>
  )
}
