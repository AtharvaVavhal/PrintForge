import { useSearchParams } from 'react-router-dom'
import type { CategoryTreeNode } from '@/types/catalog'
import { cn } from '@/utils/cn'
import styles from './CategoryFilter.module.css'

interface CategoryFilterProps {
  categoryTree: CategoryTreeNode[]
}

function findCategory(nodes: CategoryTreeNode[], id: string): CategoryTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children.length) {
      const found = findCategory(node.children, id)
      if (found) return found
    }
  }
  return undefined
}

function getParentCategory(nodes: CategoryTreeNode[], id: string, parent: CategoryTreeNode | null = null): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return parent
    if (node.children.length) {
      const found = getParentCategory(node.children, id, node)
      if (found) return found
    }
  }
  return null
}

export function CategoryFilter({ categoryTree }: CategoryFilterProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeCategoryId = searchParams.get('categoryId')

  // Top-level categories (no parent)
  const topCategories = categoryTree.filter((c) => !c.parentCategoryId)

  // If a sub-category is active, find its top-level parent
  let displayCategories = topCategories
  let activeTopCategoryId: string | null = null

  if (activeCategoryId) {
    const activeCategory = findCategory(categoryTree, activeCategoryId)
    if (activeCategory) {
      const parentCategory = getParentCategory(categoryTree, activeCategoryId)
      if (parentCategory) {
        // Show sub-categories of the parent
        displayCategories = parentCategory.children
        activeTopCategoryId = parentCategory.id
      }
    }
  }

  function selectCategory(categoryId: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (categoryId) {
        next.set('categoryId', categoryId)
      } else {
        next.delete('categoryId')
      }
      next.delete('page')
      return next
    })
  }

  const handleTopCategoryClick = (category: CategoryTreeNode) => {
    if (category.children.length > 0) {
      // If clicking the same top category, reset to show all top categories
      if (activeTopCategoryId === category.id) {
        selectCategory(null)
      } else {
        // Navigate to the parent category itself
        selectCategory(category.id)
      }
    } else {
      selectCategory(category.id)
    }
  }

  return (
    <div className={styles.filter} role="group" aria-label="Filter by category">
      {displayCategories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={cn(
            styles.pill,
            activeCategoryId === category.id && styles.pillActive,
            category.children.length > 0 && styles.hasChildren
          )}
          onClick={() => handleTopCategoryClick(category)}
        >
          {category.name}
          {category.children.length > 0 && activeTopCategoryId === category.id && (
            <span className={styles.chevron} aria-hidden="true">▼</span>
          )}
        </button>
      ))}
    </div>
  )
}
