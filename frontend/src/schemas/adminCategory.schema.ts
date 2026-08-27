import { z } from 'zod'
import type { CreateCategoryPayload } from '@/types/admin'

/** Mirrors backend/src/products/dto/{create,update}-category.dto.ts — a
 * UX convenience only, the server re-validates independently. Same
 * no-`.transform()`-inside-the-schema split as adminProduct.schema.ts:
 * `parentCategoryId` stays a plain string here (an HTML <select>'s value
 * is always a string, "" for "no parent"), converted to
 * `string | undefined` by `toCreateCategoryPayload` after validation, not
 * inside the schema itself. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_MESSAGE = 'Slug must be lowercase alphanumeric segments separated by hyphens (e.g. drinkware)'

export const adminCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  slug: z.string().trim().min(1, 'Slug is required').regex(SLUG_PATTERN, SLUG_MESSAGE),
  parentCategoryId: z.string(),
})

export type AdminCategoryFormValues = z.infer<typeof adminCategorySchema>

export function toCreateCategoryPayload(values: AdminCategoryFormValues): CreateCategoryPayload {
  return {
    name: values.name,
    slug: values.slug,
    parentCategoryId: values.parentCategoryId === '' ? undefined : values.parentCategoryId,
  }
}
