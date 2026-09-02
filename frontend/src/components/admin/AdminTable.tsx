import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react'
import { cn } from '@/utils/cn'
import { Skeleton } from '@/components/ui/Skeleton'
import styles from './AdminTable.module.css'

type Align = 'start' | 'center' | 'end'

interface AdminTableProps {
  /** Describes the table for assistive tech. Visually hidden unless
   * `captionVisible`. */
  caption: string
  captionVisible?: boolean
  children: ReactNode
  className?: string
}

/**
 * A minimal, semantic table foundation for the admin list pages (orders,
 * customers, products, coupons). It supplies only the scaffolding —
 * `<table>` + a horizontal-scroll container, `<caption>`, column-header
 * semantics, alignment, row hover / focus-within — and is composed with
 * the sub-components below. Row-click / navigation behaviour is left to
 * the caller (put a real `<Link>` in a cell) rather than baked in here.
 */
export function AdminTable({ caption, captionVisible = false, children, className }: AdminTableProps) {
  return (
    <div className={styles.scroll} role="region" aria-label={caption} tabIndex={0}>
      <table className={cn(styles.table, className)}>
        <caption className={captionVisible ? styles.caption : styles.captionHidden}>
          {caption}
        </caption>
        {children}
      </table>
    </div>
  )
}

function Head({ children }: { children: ReactNode }) {
  return <thead className={styles.head}>{children}</thead>
}

function Body({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>
}

interface RowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode
}
function Row({ children, className, ...rest }: RowProps) {
  return (
    <tr className={cn(styles.row, className)} {...rest}>
      {children}
    </tr>
  )
}

interface HeaderCellProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: Align
}
function HeaderCell({ align = 'start', className, children, ...rest }: HeaderCellProps) {
  return (
    <th scope="col" className={cn(styles.th, styles[align], className)} {...rest}>
      {children}
    </th>
  )
}

interface CellProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: Align
}
function Cell({ align = 'start', className, children, ...rest }: CellProps) {
  return (
    <td className={cn(styles.td, styles[align], className)} {...rest}>
      {children}
    </td>
  )
}

/** Full-width skeleton rows for a loading table body. */
function SkeletonBody({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className={styles.row}>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className={styles.td}>
              <Skeleton className={styles.skeletonCell} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

AdminTable.Head = Head
AdminTable.Body = Body
AdminTable.Row = Row
AdminTable.HeaderCell = HeaderCell
AdminTable.Cell = Cell
AdminTable.SkeletonBody = SkeletonBody
