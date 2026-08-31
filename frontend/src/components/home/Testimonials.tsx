import { StarRating } from '@/features/reviews/StarRating'
import styles from './Testimonials.module.css'

interface Testimonial {
  name: string
  rating: number
  content: string
  avatar?: string
}

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    name: 'Priya S.',
    rating: 5,
    content: 'Absolutely love the quality and attention to detail. The custom mug I ordered exceeded my expectations.',
  },
  {
    name: 'Rahul M.',
    rating: 5,
    content: 'Fast delivery and beautiful print work. The photo frame looks exactly as I envisioned it.',
  },
  {
    name: 'Anita K.',
    rating: 4,
    content: 'Great customer service and the t-shirt quality is premium. Will definitely order again.',
  },
]

interface TestimonialsProps {
  testimonials?: Testimonial[]
}

export function Testimonials({ testimonials = DEFAULT_TESTIMONIALS }: TestimonialsProps) {
  if (!testimonials.length) return null

  return (
    <section className={styles.section} aria-labelledby="testimonials-heading">
      <div className={styles.header}>
        <h2 id="testimonials-heading" className={styles.heading}>
          What Our Customers Say
        </h2>
        <p className={styles.subtext}>
          Real feedback from verified PrintForge customers
        </p>
      </div>
      <div className={styles.grid}>
        {testimonials.map((testimonial, index) => (
          <article key={index} className={styles.card}>
            <div className={styles.stars}>
              <StarRating avgRating={testimonial.rating.toFixed(1)} reviewCount={1} compact />
            </div>
            <p className={styles.content}>{testimonial.content}</p>
            <footer className={styles.footer}>
              <cite className={styles.name}>— {testimonial.name}</cite>
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
