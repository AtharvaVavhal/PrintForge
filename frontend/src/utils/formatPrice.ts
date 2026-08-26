/** Product prices (basePrice, priceDelta, surchargeAmount) arrive as
 * decimal strings, e.g. "150" or "99.50" — never pre-formatted. */
export function formatPrice(amount: string | number): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}
