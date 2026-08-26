/**
 * Mirrors backend/src/products/products.service.ts's `ProductWithRelations`
 * (Product & {variants, images, customizationFields}) and the raw Prisma
 * `Category` model — read directly from prisma/schema.prisma and confirmed
 * live against the real running backend (GET /categories, GET /products,
 * GET /products/:slug all curled during this phase; see the completion
 * report for the exact payloads). Decimal fields (basePrice, priceDelta,
 * surchargeAmount) arrive as strings — Prisma.Decimal's toJSON() — never
 * numbers; Date fields arrive as ISO strings over the wire, same as
 * types/auth.ts's existing convention.
 *
 * NOTE: there is no `description` field on Product — only `name` and a
 * freeform `specifications: Json | null`. The list/detail pages render
 * `specifications` generically; do not invent a description field.
 */

export interface Category {
  id: string
  name: string
  slug: string
  parentCategoryId: string | null
  createdAt: string
  updatedAt: string
}

export type CustomizationFieldType =
  | 'TEXT'
  | 'LOGO_UPLOAD'
  | 'IMAGE_UPLOAD'
  | 'DESIGN_FILE_UPLOAD'
  | 'COLOR_SELECT'
  | 'INSTRUCTIONS'

export type SurchargeType = 'NONE' | 'FLAT' | 'PER_CHARACTER'

/**
 * Ships in GET /products and GET /products/:slug (not a separate endpoint)
 * — read now for Phase 3's dynamic customization form, not rendered as a
 * form here.
 */
export interface CustomizationField {
  id: string
  productId: string
  label: string
  type: CustomizationFieldType
  isRequired: boolean
  sortOrder: number
  helpText: string | null
  constraints: Record<string, unknown> | null
  surchargeType: SurchargeType
  surchargeAmount: string
  createdAt: string
  updatedAt: string
}

export interface ProductVariant {
  id: string
  productId: string
  label: string
  priceDelta: string
  isAvailable: boolean
  createdAt: string
  updatedAt: string
}

/**
 * `cloudinaryPublicId` only — no computed URL ships in this response (see
 * the completion report: product images are uploaded with Cloudinary's
 * 'authenticated' delivery type, same as every other upload, so even a
 * correctly-guessed direct res.cloudinary.com URL would 401; there is no
 * VITE_CLOUDINARY_CLOUD_NAME env var yet either). Rendered as a deliberate
 * placeholder in this phase — see features/catalog/ProductImage.tsx.
 */
export interface ProductImage {
  id: string
  productId: string
  cloudinaryPublicId: string
  sortOrder: number
  isPrimary: boolean
  createdAt: string
}

export interface Product {
  id: string
  categoryId: string
  name: string
  slug: string
  basePrice: string
  minQuantity: number
  maxQuantity: number | null
  specifications: Record<string, unknown> | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  variants: ProductVariant[]
  images: ProductImage[]
  customizationFields: CustomizationField[]
}

/**
 * Mirrors ListProductsQueryDto exactly (page/limit/categoryId only — no
 * search or sort param exists on GET /products).
 */
export interface ListProductsParams {
  page?: number
  limit?: number
  categoryId?: string
}
