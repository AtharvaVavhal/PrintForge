import { useId } from 'react'
import type { ElementType, ReactNode } from 'react'
import { cn } from '@/utils/cn'
import styles from './AdminCard.module.css'

interface AdminCardProps {
  /** Optional card heading, rendered as an <h2>. */
  title?: string
  /** Right-aligned controls beside the title. */
  actions?: ReactNode
  children: ReactNode
  /** Element for the outer surface — `section` when the card is a titled
   * region, `div` otherwise (the default). */
  as?: ElementType
  /** Drop the inner padding — for cards whose child manages its own (e.g.
   * a flush table). */
  flush?: boolean
  className?: string
}

/**
 * A plain bordered surface for grouped admin content — summaries, detail
 * sections, forms. One restrained style, no decorative variants: a 1px
 * border, the large radius, the page background. Replaces the
 * `.summaryBlock` / `.statCard` / `.addForm` blocks duplicated across the
 * admin page CSS modules.
 */
export function AdminCard({
  title,
  actions,
  children,
  as: Tag = 'div',
  flush = false,
  className,
}: AdminCardProps) {
  const titleId = useId()
  return (
    <Tag
      className={cn(styles.card, className)}
      aria-labelledby={title ? titleId : undefined}
    >
      {(title || actions) && (
        <div className={styles.head}>
          {title && (
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={cn(styles.body, flush && styles.flush)}>{children}</div>
    </Tag>
  )
}
