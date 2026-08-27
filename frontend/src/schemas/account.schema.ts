import { z } from 'zod'

/**
 * Mirrors backend/src/users/dto/update-profile.dto.ts's field lengths
 * exactly — a UX convenience only, the server re-validates independently.
 * All 7 fields are independently optional (a user may have no address on
 * file at all, per AccountPage's existing "No address on file yet" case),
 * so nothing here enforces a min length — an empty input is a valid "leave
 * this field blank" state, not a validation error. What IS validated is
 * the max length on whatever's actually typed, matching the backend's
 * @MaxLength on each field one-for-one.
 *
 * Trimming (and the empty-string-to-null decision) happens at submit time
 * in AccountPage, not here — confirmed live that the backend accepts a
 * literal `""` and stores it verbatim rather than normalizing it to null,
 * so that conversion has to happen on the client before the request goes
 * out.
 */
const addressLine = z.string().trim().max(200, 'Must be 200 characters or fewer')
const cityStateCountry = z.string().trim().max(100, 'Must be 100 characters or fewer')
const postalCode = z.string().trim().max(20, 'Must be 20 characters or fewer')
const phone = z.string().trim().max(20, 'Must be 20 characters or fewer')

export const accountSchema = z.object({
  addressLine1: addressLine,
  addressLine2: addressLine,
  city: cityStateCountry,
  state: cityStateCountry,
  postalCode,
  country: cityStateCountry,
  phone,
})

export type AccountFormValues = z.infer<typeof accountSchema>
