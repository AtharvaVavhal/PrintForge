/**
 * Currency conversion helpers for paise/rupee display.
 * Amounts from backend are in paise as strings (e.g., "34900").
 * Razorpay expects amount in paise as a number.
 * UI displays in rupees with 2 decimal places.
 */

/** Convert paise string/number to rupees string with 2 decimal places.
 *  Examples: "34900" -> "349.00", 34900 -> "349.00", "34950" -> "349.50" */
export function paiseToRupees(paise: string | number): string {
  const n = typeof paise === 'string' ? Number(paise) : paise
  return (n / 100).toFixed(2)
}

/** Convert rupees string to paise number for Razorpay.
 *  Examples: "349.00" -> 34900, "349.50" -> 34950 */
export function rupeesToPaise(rupees: string): number {
  return Math.round(parseFloat(rupees) * 100)
}