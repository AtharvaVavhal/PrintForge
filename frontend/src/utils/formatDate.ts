/** Order/history timestamps arrive as ISO 8601 strings (§21) — formatted
 * for display only, never parsed back for logic. */
export function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoString))
}
