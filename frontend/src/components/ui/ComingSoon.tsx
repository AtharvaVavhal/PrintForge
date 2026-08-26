import styles from './ComingSoon.module.css'

interface ComingSoonProps {
  title: string
  message: string
}

/** Placeholder for a protected route whose feature ships in a later phase
 * — proves the route/auth wiring works end-to-end without building the
 * feature itself ahead of schedule. */
export function ComingSoon({ title, message }: ComingSoonProps) {
  return (
    <section className={styles.wrap}>
      <h1>{title}</h1>
      <p>{message}</p>
    </section>
  )
}
