import { z } from 'zod'

/** Header product-search box. Mirrors ListProductsQueryDto's `search`
 * field (@MaxLength(100)) — a UX convenience only, the server re-validates
 * independently, same discipline as coupon.schema.ts. */
export const headerSearchSchema = z.object({
  query: z.string().trim().min(1, 'Enter a search term').max(100),
})

export type HeaderSearchFormValues = z.infer<typeof headerSearchSchema>

export const EMPTY_HEADER_SEARCH_VALUES: HeaderSearchFormValues = { query: '' }
