import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useStoreName } from '@/hooks/useStoreName'
import styles from './Faq.module.css'

/**
 * Static FAQ — no CMS backend exists for FAQ content, so this is a
 * hardcoded array, not admin-editable. Every answer describes a capability
 * that actually exists in this application (see TrustStrip and
 * RefundPolicyPage); nothing here is copied from a competitor's claims.
 */
function buildItems(storeName: string) {
  return [
    {
      question: 'How do I customise a product?',
      answer:
        `On any product that supports customisation, you'll see options right on the product page — add text, upload a logo or photo, or choose from the available colours before adding it to your cart.`,
    },
    {
      question: 'What payment methods can I use?',
      answer:
        `Payments are processed securely through Razorpay, which supports cards and UPI. Your card details never reach ${storeName}'s servers.`,
    },
    {
      question: 'Can I use a coupon code?',
      answer: 'Yes — enter it in the Coupon field at checkout and the discount is applied before you pay.',
    },
    {
      question: 'Can I cancel or change my order after placing it?',
      answer:
        'You can cancel for a refund only before the order enters production — once printing starts, custom items can no longer be changed or cancelled. Full breakdown by order stage:',
      link: { to: ROUTES.REFUND_POLICY, label: 'Refund Policy' },
    },
    {
      question: 'How do I track my order?',
      answer:
        'Your account’s order history shows the current status of every order, and you can download an invoice once payment is confirmed.',
    },
    {
      question: 'What if my item arrives damaged or incorrect?',
      answer: 'Contact us within 7 days of delivery with photos of the item. How replacements and refunds are handled:',
      link: { to: ROUTES.REFUND_POLICY, label: 'Refund Policy' },
    },
  ] as const
}

export function Faq() {
  const storeName = useStoreName()
  const items = buildItems(storeName)

  return (
    <section className={styles.section} aria-labelledby="home-faq-heading">
      <h2 id="home-faq-heading" className={styles.heading}>
        Frequently asked questions
      </h2>
      <div className={styles.list}>
        {items.map((item) => (
          <details key={item.question} className={styles.item}>
            <summary className={styles.question}>{item.question}</summary>
            <p className={styles.answer}>
              {item.answer}
              {'link' in item && item.link && (
                <>
                  {' '}
                  <Link to={item.link.to} className={styles.link}>
                    {item.link.label}
                  </Link>
                  .
                </>
              )}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}
