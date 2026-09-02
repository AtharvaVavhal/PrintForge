import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { ROUTES } from '@/constants/routes'
import type { CategoryTreeNode } from '@/types/catalog'
import styles from './MegaMenu.module.css'

function categoryHref(id: string): string {
  return `${ROUTES.PRODUCTS}?categoryId=${encodeURIComponent(id)}`
}

/** True when `id` is this node or any descendant of it — used to light up a
 * top-level entry when a child category's PLP is the active page. */
function subtreeContains(node: CategoryTreeNode, id: string | null): boolean {
  if (!id) return false
  if (node.id === id) return true
  return node.children.some((child) => subtreeContains(child, id))
}

/**
 * Desktop category navigation. Renders straight from the public
 * `/categories/tree` payload (active categories only — the backend filters
 * `isActive`, there is no client-side name filtering): a flat category is a
 * plain link; a category with children is a disclosure button that opens a
 * dropdown listing its children plus an "All <category>" link.
 *
 * The parent <nav aria-label> comes from Header — this component only owns
 * the list and its dropdowns.
 */
export function MegaMenuBar({ categories }: { categories: CategoryTreeNode[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const activeCategoryId = searchParams.get('categoryId')
  const barRef = useRef<HTMLUListElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const close = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenId(null)
  }, [])

  const open = useCallback((id: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenId(id)
  }, [])

  // Hover-out has a short grace period so the pointer can travel from the
  // trigger to the panel without it collapsing.
  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenId(null), 120)
  }, [])

  // Close on Escape or a click outside the menu. (Clicking a category link
  // closes it via that link's own onClick handler.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    function onPointerDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [close])
  useEffect(() => () => close(), [close])

  const isOnAllProducts =
    location.pathname === ROUTES.PRODUCTS && !activeCategoryId

  if (categories.length === 0) {
    // Loading is handled by Header's skeleton; this is the empty / error
    // fallback — the nav is never just blank.
    return (
      <ul className={styles.bar} ref={barRef}>
        <li>
          <NavLink to={ROUTES.PRODUCTS} className={cn(styles.link, isOnAllProducts && styles.linkActive)}>
            All products
          </NavLink>
        </li>
      </ul>
    )
  }

  return (
    <ul className={styles.bar} ref={barRef}>
      <li className={styles.item}>
        <NavLink
          to={ROUTES.PRODUCTS}
          className={cn(styles.link, isOnAllProducts && styles.linkActive)}
        >
          All
        </NavLink>
      </li>

      {categories.map((category) => {
        const active = subtreeContains(category, activeCategoryId)

        if (category.children.length === 0) {
          return (
            <li key={category.id} className={styles.item}>
              <NavLink
                to={categoryHref(category.id)}
                className={cn(styles.link, active && styles.linkActive)}
              >
                {category.name}
              </NavLink>
            </li>
          )
        }

        const isOpen = openId === category.id
        const panelId = `megamenu-${category.id}`

        return (
          <li
            key={category.id}
            className={styles.item}
            onMouseEnter={() => open(category.id)}
            onMouseLeave={scheduleClose}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) close()
            }}
          >
            <button
              type="button"
              className={cn(styles.trigger, (active || isOpen) && styles.linkActive)}
              aria-haspopup="true"
              aria-expanded={isOpen}
              aria-controls={panelId}
              // Click / Enter / Space opens the panel; it closes on Escape,
              // an outside click, pointer-leave, or focus leaving the group
              // (below). Not a toggle — that races the pointer-enter open on
              // the parent <li> and would slam shut on the same gesture.
              onClick={() => open(category.id)}
            >
              {category.name}
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={cn(styles.chevron, isOpen && styles.chevronOpen)}
              />
            </button>

            <div
              id={panelId}
              className={cn(styles.panel, !isOpen && styles.panelHidden)}
              onMouseEnter={() => open(category.id)}
              onMouseLeave={scheduleClose}
            >
              <NavLink
                to={categoryHref(category.id)}
                className={styles.panelAll}
                onClick={close}
              >
                All {category.name}
              </NavLink>
              <ul className={styles.panelGrid}>
                {category.children.map((child) => (
                  <li key={child.id} className={styles.panelGroup}>
                    <NavLink
                      to={categoryHref(child.id)}
                      className={styles.panelGroupTitle}
                      onClick={close}
                    >
                      {child.name}
                    </NavLink>
                    {child.children.length > 0 && (
                      <ul className={styles.panelSubList}>
                        {child.children.map((grandchild) => (
                          <li key={grandchild.id}>
                            <NavLink
                              to={categoryHref(grandchild.id)}
                              className={styles.panelSubLink}
                              onClick={close}
                            >
                              {grandchild.name}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
