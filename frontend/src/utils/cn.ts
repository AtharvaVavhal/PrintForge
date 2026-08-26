/** Joins truthy class names — no clsx/tailwind-merge dependency needed for
 * this project's plain-CSS-module styling. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
