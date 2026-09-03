/**
 * Normalized, provider-agnostic response for `GET /postal-codes/:postalCode`.
 *
 * Deliberately flat and small: the raw provider payload carries per-post-
 * office rows, slugs, lat/long, DIGIPIN, circle/region/division — none of
 * which the checkout form needs or should see. A PIN can map to several
 * post offices; `city`/`district`/`state` here are resolved across all of
 * them (see PostalLookupService.normalize), not read off the first row.
 */
export interface PostalLookupView {
  postalCode: string;
  /** Best city-level label for the PIN — the postal district. */
  city: string;
  district: string;
  state: string;
  /** Always "India" for this provider (Indian Post dataset). The checkout
   * form treats this as an editable suggestion, not a locked value. */
  country: string;
}
