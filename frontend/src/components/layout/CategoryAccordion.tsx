import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CategoryTreeNode } from '@/types/catalog'
import styles from './CategoryAccordion.module.css'

interface CategoryAccordionProps {
  categories: CategoryTreeNode[]
  level?: number
}

export function CategoryAccordion({ categories, level = 0 }: CategoryAccordionProps) {
  if (!categories.length) return null

  return (
    <ul className={cn(styles.list, level > 0 && styles.nested)} role="list">
      {categories.map((cat) => (
        <li key={cat.id} className={styles.item}>
          {cat.children.length > 0 ? (
            <CategoryAccordionItem category={cat} level={level} />
          ) : (
            <NavLink
              to={`/products?categoryId=${cat.id}`}
              className={cn(styles.link, level > 0 && styles.nestedLink)}
            >
              {cat.name}
            </NavLink>
          )}
        </li>
      ))}
    </ul>
  )
}

interface CategoryAccordionItemProps {
  category: CategoryTreeNode
  level: number
}

function CategoryAccordionItem({ category, level }: CategoryAccordionItemProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className={cn(styles.trigger, level > 0 && styles.nestedTrigger)}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`${category.id}-children`}
      >
        <span className={styles.triggerLabel}>{category.name}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(styles.chevron, open && styles.chevronOpen)}
        />
      </button>
      <ul
        id={`${category.id}-children`}
        className={cn(styles.children, !open && styles.hidden)}
        role="list"
      >
        <li className={styles.item}>
          <NavLink
            to={`/products?categoryId=${category.id}`}
            className={styles.parentLink}
          >
            All {category.name}
          </NavLink>
        </li>
        <CategoryAccordion categories={category.children} level={level + 1} />
      </ul>
    </>
  )
}
