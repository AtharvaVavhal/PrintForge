import { Alert } from '@/components/ui/Alert'
import styles from './ContactPage.module.css'

// TODO: client to provide final Contact page copy, verified business contact
// details (support email, phone, address), and a real message-handling
// endpoint before launch. Until then this page only states that those
// channels are not yet available — it never collects or pretends to send a
// message.
export function ContactPage() {
  return (
    <section className={styles.page}>
      <h1>Contact Us</h1>
      <p className={styles.intro}>
        Our customer support channels are still being set up. Verified contact
        details and a way to reach us will be published on this page before
        launch.
      </p>

      <Alert variant="info">
        <strong>Contact details coming soon.</strong> A support email, phone
        number, and business address have not been confirmed yet, so there is
        no contact form here right now. Please check back closer to launch.
      </Alert>
    </section>
  )
}
