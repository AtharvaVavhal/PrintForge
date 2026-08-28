import { BadgeCheck, ShieldCheck, Wand2 } from 'lucide-react'
import styles from './TrustBar.module.css'

/**
 * Only claims that are true today, each grounded in a real, shipped
 * feature — not marketing copy:
 * - Razorpay checkout: backend/src/payments/razorpay is live (§31).
 * - Customization: every product's CustomizationForm is real (Phase 3).
 * - Verified buyers: ReviewList's "Verified buyer" label is backed by a
 *   server-side verified-purchase gate (a 409 on write otherwise), not
 *   just a static label — see ReviewList.tsx's own doc comment.
 *
 * Deliberately no delivery/returns claim here — no shipping-time or
 * returns-policy copy exists yet to point to truthfully.
 */
const CLAIMS = [
  { Icon: ShieldCheck, text: 'Secure checkout via Razorpay' },
  { Icon: Wand2, text: 'Every order made to your customization' },
  { Icon: BadgeCheck, text: 'Reviews from verified buyers' },
] as const

export function TrustBar() {
  return (
    <ul className={styles.bar} aria-label="Why shop with us">
      {CLAIMS.map(({ Icon, text }) => (
        <li key={text} className={styles.claim}>
          <Icon size={20} aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}
