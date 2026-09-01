import styles from './AboutPage.module.css'

// TODO: client to provide final About page copy
export function AboutPage() {
  return (
    <section className={styles.page}>
      <h1>About PrintForge</h1>
      <p>
        PrintForge is a custom‑printing platform that lets customers design and order
        printed products entirely online. From product discovery through file upload,
        checkout, production and delivery — every step is handled in a single,
        transparent workflow.
      </p>
      <p>
        Our mission is to make professional‑grade custom printing accessible to
        individuals and small businesses without the friction of traditional
        print‑shop workflows.
      </p>
    </section>
  )
}
