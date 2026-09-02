import type { ReactNode } from 'react'
import { Seo } from '@/seo/Seo'
import styles from './AuthFormShell.module.css'

interface AuthFormShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

/** Shared centered-card wrapper for the four auth pages (login, register,
 * forgot-password, reset-password) — one place for the visual pattern
 * instead of duplicating it per page. Also the single place auth pages get
 * their (always noindex) document metadata. */
export function AuthFormShell({ title, subtitle, children, footer }: AuthFormShellProps) {
  return (
    <div className={styles.wrap}>
      <Seo title={title} noindex />
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
