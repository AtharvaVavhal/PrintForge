import { useQuery } from '@tanstack/react-query'
import { fetchCurrentUser } from '@/services/api/auth'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import styles from './AccountPage.module.css'

export function AccountPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: fetchCurrentUser,
  })

  return (
    <section className={styles.wrap}>
      <h1>My account</h1>

      {isLoading && <p>Loading your profile…</p>}
      {isError && <Alert variant="error">{getApiErrorMessage(error)}</Alert>}

      {data && (
        <dl className={styles.details}>
          <dt>Email</dt>
          <dd>{data.email}</dd>

          <dt>Address</dt>
          <dd>
            {data.addressLine1
              ? [data.addressLine1, data.addressLine2, data.city, data.state, data.postalCode, data.country]
                  .filter(Boolean)
                  .join(', ')
              : 'No address on file yet.'}
          </dd>

          <dt>Phone</dt>
          <dd>{data.phone ?? 'Not provided'}</dd>
        </dl>
      )}
    </section>
  )
}
