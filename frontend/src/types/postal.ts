/**
 * Mirrors backend/src/postal/dto/postal-lookup-view.interface.ts — the
 * normalised response for GET /postal-codes/:postalCode. The raw provider
 * shape never reaches the frontend; this is all the shipping form needs.
 */
export interface PostalLookupView {
  postalCode: string
  /** Best city-level label for the PIN — the postal district. */
  city: string
  district: string
  state: string
  /** Always "India" for the current provider — treated as an editable
   * suggestion, never a locked value. */
  country: string
}
