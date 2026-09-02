import type { CategoryTreeNode } from '@/types/catalog'

/**
 * The chain of categories from a root down to `categoryId`, inclusive.
 * Empty when `categoryId` is absent or not found in the tree. Shared by
 * the filter sidebar and the listing-page breadcrumb / active-filter chips
 * so they always agree on the category hierarchy.
 */
export function findCategoryPath(
  nodes: CategoryTreeNode[],
  categoryId?: string,
  path: CategoryTreeNode[] = [],
): CategoryTreeNode[] {
  if (!categoryId) return []

  for (const node of nodes) {
    const nextPath = [...path, node]
    if (node.id === categoryId) return nextPath

    const childPath = findCategoryPath(node.children, categoryId, nextPath)
    if (childPath.length > 0) return childPath
  }

  return []
}
