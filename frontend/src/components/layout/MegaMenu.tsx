import { useRef, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CategoryTreeNode } from '@/types/catalog'
import styles from './MegaMenu.module.css'

interface MegaMenuProps {
  categories: CategoryTreeNode[]
  onClose: () => void
}

function CategoryColumn({ items, depth = 0, onNavigate }: { items: CategoryTreeNode[]; depth?: number; onNavigate: () => void }) {
  if (!items.length) return null

  return (
    <ul className={cn(styles.column, depth > 0 && styles.nested)} role="menu">
      {items.map((cat) => (
        <li key={cat.id} role="none">
          {cat.children.length > 0 ? (
            <div className={styles.categoryGroup}>
              <NavLink
                to={`/products?categoryId=${cat.id}`}
                className={cn(styles.categoryTitle, depth > 0 && styles.nestedTitle)}
                onClick={onNavigate}
                role="menuitem"
              >
                {cat.name}
                <ChevronRight size={14} aria-hidden="true" className={styles.chevron} />
              </NavLink>
              <CategoryColumn items={cat.children} depth={depth + 1} onNavigate={onNavigate} />
            </div>
          ) : (
            <NavLink
              to={`/products?categoryId=${cat.id}`}
              className={styles.categoryLink}
              onClick={onNavigate}
              role="menuitem"
            >
              {cat.name}
            </NavLink>
          )}
        </li>
      ))}
    </ul>
  )
}

export function MegaMenu({ categories, onClose }: MegaMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Close on route change
  useEffect(() => {
    onClose()
  }, [location.pathname, onClose])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (!categories.length) return null

  function onNavigate() {
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className={styles.panel}
      role="navigation"
      aria-label="Category mega menu"
    >
      <div className={styles.grid}>
        {categories.map((cat) => (
          <div key={cat.id} className={styles.columnWrapper}>
            {cat.children.length > 0 ? (
              <>
                <NavLink
                  to={`/products?categoryId=${cat.id}`}
                  className={styles.topCategory}
                  onClick={onNavigate}
                  role="menuitem"
                >
                  {cat.name}
                </NavLink>
                <CategoryColumn items={cat.children} onNavigate={onNavigate} />
                <div className={styles.promoSlot} aria-hidden="true" />
              </>
            ) : (
              <NavLink
                to={`/products?categoryId=${cat.id}`}
                className={styles.topCategory}
                onClick={onNavigate}
                role="menuitem"
              >
                {cat.name}
              </NavLink>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface MegaMenuTriggerProps {
  category: CategoryTreeNode
  onOpen: (id: string) => void
  onClose: () => void
  isOpen: boolean
}

function MegaMenuTrigger({ category, onOpen, onClose, isOpen }: MegaMenuTriggerProps) {
  return (
    <button
      className={styles.trigger}
      onClick={() => isOpen ? onClose() : onOpen(category.id)}
      onMouseEnter={() => onOpen(category.id)}
      aria-haspopup="true"
      aria-expanded={isOpen}
    >
      {category.name}
    </button>
  )
}

export function MegaMenuBar({ categories }: { categories: CategoryTreeNode[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenId(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <nav className={styles.bar} aria-label="Categories">
        {categories.map((cat) => (
          <MegaMenuTrigger
            key={cat.id}
            category={cat}
            onOpen={setOpenId}
            onClose={() => setOpenId(null)}
            isOpen={openId === cat.id}
          />
        ))}
      </nav>
      {openId && (
        <MegaMenu
          categories={categories}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}
