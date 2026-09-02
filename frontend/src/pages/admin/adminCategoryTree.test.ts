import { describe, expect, it } from 'vitest'
import type { Category } from '@/types/catalog'
import { sortCategoriesForDisplay, getDescendantIds } from './adminCategoryTree'

function cat(id: string, name: string, parentCategoryId: string | null = null): Category {
  return {
    id,
    name,
    slug: id,
    parentCategoryId,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('sortCategoriesForDisplay', () => {
  it('sorts roots alphabetically with children directly beneath, and does not mutate the input', () => {
    const input = [
      cat('g', 'Gamma'),
      cat('b', 'Beta', 'a'),
      cat('a', 'Alpha'),
      cat('a2', 'Alpha child 2', 'a'),
      cat('a1', 'Alpha child 1', 'a'),
    ]
    const snapshot = input.map((c) => c.id)

    const rows = sortCategoriesForDisplay(input)

    expect(rows.map((r) => [r.category.name, r.depth])).toEqual([
      ['Alpha', 0],
      ['Alpha child 1', 1],
      ['Alpha child 2', 1],
      ['Beta', 1],
      ['Gamma', 0],
    ])
    expect(input.map((c) => c.id)).toEqual(snapshot)
  })

  it('renders every category exactly once even with self-parenting and cycles', () => {
    const input = [
      cat('self', 'Self parented', 'self'),
      cat('x', 'X', 'y'),
      cat('y', 'Y', 'x'),
      cat('ok', 'Ok'),
    ]

    const rows = sortCategoriesForDisplay(input)

    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((r) => r.category.id)).size).toBe(4)
  })

  it('treats a child whose parent is missing as a root', () => {
    const rows = sortCategoriesForDisplay([cat('orphan', 'Orphan', 'gone')])
    expect(rows).toHaveLength(1)
    expect(rows[0].category.id).toBe('orphan')
    expect(rows[0].depth).toBe(0)
  })
})

describe('getDescendantIds', () => {
  it('collects transitive children but not the category itself', () => {
    const input = [
      cat('root', 'Root'),
      cat('a', 'A', 'root'),
      cat('b', 'B', 'a'),
      cat('other', 'Other'),
    ]
    expect([...getDescendantIds('root', input)].sort()).toEqual(['a', 'b'])
    expect(getDescendantIds('root', input).has('root')).toBe(false)
    expect(getDescendantIds('other', input).size).toBe(0)
  })
})
