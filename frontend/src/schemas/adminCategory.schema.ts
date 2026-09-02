import { z } from 'zod'
import type { CreateCategoryPayload, UpdateCategoryPayload } from '@/types/admin'

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

/**
 * Edit payload. Unlike create, choosing "None" for the parent must send an
 * explicit `parentCategoryId: null` — a PATCH that merely omits the key
 * leaves the existing parent untouched, so a nested category could never
 * be moved back to the top level (a real pre-existing bug). The backend's
 * `UpdateCategoryDto` marks `parentCategoryId` `@IsOptional()`, which
 * accepts `null` and clears the column. The cast is only because the
 * shared `UpdateCategoryPayload` type models `string | undefined`; the
 * wire value here is genuinely nullable and the frozen type can't say so.
 */
export function toUpdateCategoryPayload(values: AdminCategoryFormValues): UpdateCategoryPayload {
  return {
    name: values.name,
    slug: values.slug,
    parentCategoryId: values.parentCategoryId === '' ? null : values.parentCategoryId,
  } as unknown as UpdateCategoryPayload
}
