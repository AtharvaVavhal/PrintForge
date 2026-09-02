import type { Category } from '@/types/catalog'

export interface CategoryDisplayRow {
  category: Category
  depth: number
}

/** Builds the parent→children index from a flat `Category[]`. A row whose
 * `parentCategoryId` is null, points at a missing category, or points at
 * itself is treated as a root. */
function indexChildren(categories: Category[]): {
  roots: Category[]
  childrenByParent: Map<string, Category[]>
} {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const childrenByParent = new Map<string, Category[]>()
  const roots: Category[] = []
  for (const category of categories) {
    const parentId = category.parentCategoryId
    if (parentId != null && parentId !== category.id && byId.has(parentId)) {
      const siblings = childrenByParent.get(parentId) ?? []
      siblings.push(category)
      childrenByParent.set(parentId, siblings)
    } else {
      roots.push(category)
    }
  }
  return { roots, childrenByParent }
}

/**
 * Pure helper — the flat admin `Category[]` becomes a parent-first,
 * alphabetically-sorted, depth-annotated list. The intended hierarchy is
 * one level, but this tolerates malformed deeper/cyclic data: a `visited`
 * set guarantees every category renders exactly once, and anything a cycle
 * keeps out of the walk is appended at depth 0. Does not mutate the input.
 */
export function sortCategoriesForDisplay(categories: Category[]): CategoryDisplayRow[] {
  const { roots, childrenByParent } = indexChildren(categories)
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)
  const sortedRoots = [...roots].sort(byName)
  for (const siblings of childrenByParent.values()) siblings.sort(byName)

  const out: CategoryDisplayRow[] = []
  const visited = new Set<string>()
  const walk = (category: Category, depth: number) => {
    if (visited.has(category.id)) return
    visited.add(category.id)
    out.push({ category, depth })
    for (const child of childrenByParent.get(category.id) ?? []) walk(child, depth + 1)
  }
  for (const root of sortedRoots) walk(root, 0)
  // Categories a cycle kept out of the walk (e.g. mutual A↔B parents).
  for (const category of [...categories].sort(byName)) {
    if (!visited.has(category.id)) {
      visited.add(category.id)
      out.push({ category, depth: 0 })
    }
  }
  return out
}

/** Self plus every transitive child of `categoryId`, from the same flat
 * list. Used to narrow the edit form's parent options so the UI can't
 * create a cycle. */
export function getDescendantIds(categoryId: string, categories: Category[]): Set<string> {
  const { childrenByParent } = indexChildren(categories)
  const out = new Set<string>()
  const stack = [categoryId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    for (const child of childrenByParent.get(id) ?? []) {
      if (!out.has(child.id) && child.id !== categoryId) {
        out.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return out
}
