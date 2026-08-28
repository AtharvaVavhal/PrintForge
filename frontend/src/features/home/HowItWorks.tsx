import { Palette, Printer, Truck } from 'lucide-react'
import styles from './HowItWorks.module.css'

/** Static copy — accurate to the real order flow (customization form +
 * payment-triggered production both exist today), not aspirational. */
const STEPS = [
  {
    Icon: Palette,
    title: 'Choose & customize',
    description: 'Pick a product and personalize it with your own text, logo, or design.',
  },
  {
    Icon: Printer,
    title: 'We print it',
    description: 'Once payment is confirmed, your order goes into production.',
  },
  {
    Icon: Truck,
    title: 'Delivery',
    description: 'Your finished order ships straight to your address.',
  },
] as const

export function HowItWorks() {
  return (
    <ol className={styles.steps}>
      {STEPS.map(({ Icon, title, description }, index) => (
        <li key={title} className={styles.step}>
          <span className={styles.stepNumber} aria-hidden="true">
            {index + 1}
          </span>
          <Icon size={28} aria-hidden="true" className={styles.stepIcon} />
          <h3 className={styles.stepTitle}>{title}</h3>
          <p className={styles.stepDescription}>{description}</p>
        </li>
      ))}
    </ol>
  )
}
