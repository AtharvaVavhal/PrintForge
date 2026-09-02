import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Search } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import {
  EMPTY_HEADER_SEARCH_VALUES,
  headerSearchSchema,
  type HeaderSearchFormValues,
} from '@/schemas/search.schema'
import styles from './Header.module.css'

/**
 * The product search box. Rendered twice — once in the desktop header bar,
 * once inside the mobile navigation drawer — so search is reachable at
 * every breakpoint. Each instance owns its own form state; a submit
 * navigates to the listing page with `?search=` and calls `onSubmitted`
 * (used to close the drawer on mobile).
 */
export function HeaderSearch({
  variant,
  onSubmitted,
}: {
  variant: 'bar' | 'drawer'
  onSubmitted?: () => void
}) {
  const navigate = useNavigate()
  const inputId = useId()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HeaderSearchFormValues>({
    resolver: zodResolver(headerSearchSchema),
    defaultValues: EMPTY_HEADER_SEARCH_VALUES,
  })

  function onValid(values: HeaderSearchFormValues) {
    reset(EMPTY_HEADER_SEARCH_VALUES)
    onSubmitted?.()
    void navigate(`${ROUTES.PRODUCTS}?search=${encodeURIComponent(values.query)}`)
  }

  return (
    <form
      className={variant === 'bar' ? styles.searchForm : styles.searchFormDrawer}
      role="search"
      onSubmit={(e) => void handleSubmit(onValid)(e)}
      noValidate
    >
      <label htmlFor={inputId} className={styles.searchLabel}>
        Search products
      </label>
      <Search size={18} className={styles.searchIcon} aria-hidden="true" />
      <input
        id={inputId}
        type="search"
        placeholder="Search products…"
        className={styles.searchInput}
        aria-invalid={Boolean(errors.query)}
        {...register('query')}
      />
      <button type="submit" className={styles.searchSubmit} aria-label="Search">
        <Search size={18} aria-hidden="true" />
      </button>
      {errors.query && (
        <p className={styles.searchError} role="alert">
          {errors.query.message}
        </p>
      )}
    </form>
  )
}
