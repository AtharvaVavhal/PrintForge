import { z } from 'zod'
import type { CustomizationField } from '@/types/catalog'
import { isFileFieldType } from '@/utils/customizationPricing'

interface FieldConstraints {
  maxLength?: number
  options?: string[]
}

function parseConstraints(field: CustomizationField): FieldConstraints {
  return field.constraints ?? {}
}

/**
 * Builds a per-product Zod schema from its customizationFields, keyed by
 * field id — mirrors backend/src/products/customizations/customization-
 * validation.util.ts's validateCustomizationFieldShape (required-ness,
 * maxLength, COLOR_SELECT options) so the customer sees the same verdict
 * the server will before submitting anything. This is a UX convenience
 * only: the server re-validates independently (and additionally checks
 * file ownership/format/size, which needs the uploaded_files row — see
 * CustomizationValidationService) and is the actual source of truth.
 *
 * Every value is a plain string. For file fields that string is the
 * uploadedFileId set once FileUploadField's upload succeeds — never the
 * raw File object, which never enters react-hook-form state.
 *
 * Return type is asserted rather than inferred: the shape object is built
 * as Record<string, z.ZodTypeAny> (field ids aren't known until runtime),
 * which erases each entry's actual string-returning schema down to
 * z.infer<ZodTypeAny> = unknown. Every branch below only ever produces a
 * z.string()-derived schema, so the assertion reflects real runtime
 * behavior, not a workaround for one.
 */
export function buildCustomizationSchema(
  fields: CustomizationField[],
): z.ZodType<Record<string, string>, Record<string, string>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of fields) {
    const constraints = parseConstraints(field)
    let schema = z.string()

    if (!isFileFieldType(field.type) && constraints.maxLength !== undefined) {
      schema = schema.max(
        constraints.maxLength,
        `${field.label} must be at most ${constraints.maxLength} characters`,
      )
    }

    let fieldSchema: z.ZodTypeAny = schema
    if (field.type === 'COLOR_SELECT' && constraints.options?.length) {
      const options = constraints.options
      fieldSchema = schema.refine((value) => value === '' || options.includes(value), {
        message: `${field.label} must be one of: ${options.join(', ')}`,
      })
    }

    shape[field.id] = field.isRequired
      ? fieldSchema.refine((value) => typeof value === 'string' && value.trim().length > 0, {
          message: `${field.label} is required`,
        })
      : fieldSchema
  }

  return z.object(shape) as unknown as z.ZodType<Record<string, string>, Record<string, string>>
}
