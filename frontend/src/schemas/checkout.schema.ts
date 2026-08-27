import { z } from 'zod'

/** Mirrors backend/src/checkout/dto/create-order.dto.ts's field lengths
 * exactly — a UX convenience only, the server re-validates independently. */
export const shippingSchema = z.object({
  shippingRecipientName: z.string().trim().min(1, 'Recipient name is required').max(160),
  shippingPhone: z.string().trim().min(1, 'Phone number is required').max(20),
  shippingAddressLine1: z.string().trim().min(1, 'Address is required').max(200),
  shippingAddressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  shippingCity: z.string().trim().min(1, 'City is required').max(100),
  shippingState: z.string().trim().min(1, 'State is required').max(100),
  shippingPostalCode: z.string().trim().min(1, 'Postal code is required').max(20),
  shippingCountry: z.string().trim().min(1, 'Country is required').max(100),
})

export type ShippingFormValues = z.infer<typeof shippingSchema>
