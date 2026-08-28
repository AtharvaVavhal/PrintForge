import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p>&copy; {new Date().getFullYear()} AB Creations. All rights reserved.</p>
      </div>
    </footer>
  )
}
