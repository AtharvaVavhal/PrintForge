import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import styles from './Page.module.css'

interface PageProps {
  children: ReactNode
  /**
   * Extra class(es) for genuinely page-specific tweaks, merged after the
   * base shell. Use sparingly — the point of the primitive is that the
   * shell stays identical across pages.
   */
  className?: string
}

/**
 * The shared storefront page shell (UX-40): a centred `--container-max`
 * column with the standard responsive horizontal padding
 * (`--container-padding`), the standard 2.5rem / 4rem vertical padding, and
 * a 24px (`--space-5`) flex-column vertical rhythm between its direct
 * children.
 *
 * It is presentational only — it owns no heading, landmark, document
 * metadata, or state (the same split the admin side uses between
 * `AdminLayout` and `AdminPage`). Pages compose their own
 * `<h1>` / header / body inside it and keep rendering their own `<Seo>`.
 *
 * Renders a `<section>` because that is the element the storefront pages
 * already used for this wrapper; the accessible tree is unchanged.
 *
 * Not every storefront page uses this: the home page is full-bleed, the
 * product detail page is a two-column grid, the 404 / 403 pages are a
 * centred error state, and the static/legal + invoice pages use a
 * narrower document column with their own padding.
 */
export function Page({ children, className }: PageProps) {
  return <section className={cn(styles.page, className)}>{children}</section>
}
