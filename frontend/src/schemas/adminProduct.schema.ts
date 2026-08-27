import { z } from 'zod'
import type {
  CreateCustomizationFieldPayload,
  CreateProductPayload,
  CreateVariantPayload,
} from '@/types/admin'

/**
 * Mirrors backend/src/products/dto/{create,update}-product.dto.ts,
 * create/update-variant.dto.ts, and create/update-customization-field.dto.ts
 * field-for-field — a UX convenience only, the server re-validates
 * independently. No `description`/`isActive` fields: neither exists on
 * the writable surface (see types/admin.ts's CreateProductPayload doc
 * comment).
 *
 * These schemas validate the raw form-input shape only (every numeric/
 * optional field stays a plain string, matching what an HTML input
 * actually gives react-hook-form) — deliberately no `.transform()` inside
 * the schema itself. Mixing a transforming zod schema with useForm's
 * generic type creates an input/output mismatch `zodResolver` has to be
 * specially configured for, and nothing elsewhere in this codebase does
 * that (checkout.schema.ts/account.schema.ts both stay string-in,
 * string-out). The string-to-payload conversion (empty string ->
 * undefined, string -> number, JSON.parse) happens in the `toXPayload`
 * functions below, called from the submit handler after validation
 * succeeds — same split AccountPage.tsx's buildProfilePatch already uses.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_MESSAGE = 'Slug must be lowercase alphanumeric segments separated by hyphens (e.g. ceramic-mug)'
const DECIMAL_MESSAGE = 'Must be 0 or more, at most 2 decimal places'
const INT_MESSAGE = 'Must be a whole number'

function isValidDecimal(value: string): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && Math.round(n * 100) === n * 100
}

function isValidPositiveInt(value: string): boolean {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1
}

function isValidNonNegativeInt(value: string): boolean {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0
}

function isValidJsonObject(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/** Empty string -> undefined (field omitted); parses to a plain object
 * otherwise. Assumes `isValidJsonObject` already passed via schema
 * validation — never called on unvalidated input. */
function parseJsonObjectField(value: string): Record<string, unknown> | undefined {
  return value.trim() === '' ? undefined : (JSON.parse(value) as Record<string, unknown>)
}

const JSON_OBJECT_MESSAGE = 'Must be valid JSON, e.g. {"material":"ceramic"}'

export const adminProductSchema = z.object({
  categoryId: z.string().uuid('Select a category'),
  name: z.string().trim().min(1, 'Name is required').max(160),
  slug: z.string().trim().min(1, 'Slug is required').regex(SLUG_PATTERN, SLUG_MESSAGE),
  basePrice: z.string().trim().min(1, 'Base price is required').refine(isValidDecimal, DECIMAL_MESSAGE),
  minQuantity: z
    .string()
    .trim()
    .min(1, 'Minimum quantity is required')
    .refine(isValidPositiveInt, `${INT_MESSAGE}, at least 1`),
  maxQuantity: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidPositiveInt(v), `${INT_MESSAGE}, at least 1`),
  specifications: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidJsonObject(v), JSON_OBJECT_MESSAGE),
})

export type AdminProductFormValues = z.infer<typeof adminProductSchema>

export function toCreateProductPayload(values: AdminProductFormValues): CreateProductPayload {
  return {
    categoryId: values.categoryId,
    name: values.name,
    slug: values.slug,
    basePrice: Number(values.basePrice),
    minQuantity: Number(values.minQuantity),
    maxQuantity: values.maxQuantity === '' ? undefined : Number(values.maxQuantity),
    specifications: parseJsonObjectField(values.specifications),
  }
}

export const variantSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(120),
  priceDelta: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidDecimal(v) || (v.startsWith('-') && isValidDecimal(v.slice(1))), DECIMAL_MESSAGE),
  isAvailable: z.boolean(),
})

export type VariantFormValues = z.infer<typeof variantSchema>

export function toCreateVariantPayload(values: VariantFormValues): CreateVariantPayload {
  return {
    label: values.label,
    priceDelta: values.priceDelta === '' ? undefined : Number(values.priceDelta),
    isAvailable: values.isAvailable,
  }
}

const CUSTOMIZATION_FIELD_TYPES = [
  'TEXT',
  'LOGO_UPLOAD',
  'IMAGE_UPLOAD',
  'DESIGN_FILE_UPLOAD',
  'COLOR_SELECT',
  'INSTRUCTIONS',
] as const

const SURCHARGE_TYPES = ['NONE', 'FLAT', 'PER_CHARACTER'] as const

export const customizationFieldSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(120),
  type: z.enum(CUSTOMIZATION_FIELD_TYPES),
  isRequired: z.boolean(),
  sortOrder: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidNonNegativeInt(v), `${INT_MESSAGE}, 0 or more`),
  helpText: z.string().trim().max(500),
  constraints: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidJsonObject(v), JSON_OBJECT_MESSAGE),
  surchargeType: z.enum(SURCHARGE_TYPES),
  surchargeAmount: z.string().trim().refine((v) => v === '' || isValidDecimal(v), DECIMAL_MESSAGE),
})

export type CustomizationFieldFormValues = z.infer<typeof customizationFieldSchema>

export function toCreateCustomizationFieldPayload(
  values: CustomizationFieldFormValues,
): CreateCustomizationFieldPayload {
  return {
    label: values.label,
    type: values.type,
    isRequired: values.isRequired,
    sortOrder: values.sortOrder === '' ? 0 : Number(values.sortOrder),
    helpText: values.helpText === '' ? undefined : values.helpText,
    constraints: parseJsonObjectField(values.constraints),
    surchargeType: values.surchargeType,
    surchargeAmount: values.surchargeAmount === '' ? undefined : Number(values.surchargeAmount),
  }
}
