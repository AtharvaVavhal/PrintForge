import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, ChevronRight } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useToast } from '@/components/ui/toast/useToast'
import { getApiErrorMessage } from '@/utils/apiError'
import { ROUTES } from '@/constants/routes'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Page } from '@/components/ui/Page'
import { Skeleton } from '@/components/ui/Skeleton'
import { Seo } from '@/seo/Seo'
import { LogoutButton } from '@/features/auth/LogoutButton'
import { ProfileForm } from '@/features/account/ProfileForm'
import type { AccountFormValues } from '@/schemas/account.schema'
import type { UpdateProfilePayload, UserProfileView } from '@/types/auth'
import styles from './AccountPage.module.css'

const PROFILE_FIELDS = ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'phone'] as const

/** Turns a validated form snapshot into a PATCH body containing only what
 * actually changed from the loaded profile — never resends untouched
 * fields. A blank input means "clear this field": normalized to `null`
 * (never a literal `""` — confirmed live that the backend stores that
 * verbatim rather than treating it as "unset"), then compared against the
 * original (itself already `string | null`) to decide inclusion. */
function buildProfilePatch(values: AccountFormValues, original: UserProfileView): UpdateProfilePayload {
  const patch: UpdateProfilePayload = {}
  for (const field of PROFILE_FIELDS) {
    const normalized = values[field].trim() === '' ? null : values[field].trim()
    if (normalized !== (original[field] ?? null)) {
      patch[field] = normalized
    }
  }
  return patch
}

export function AccountPage() {
  const { data, isLoading, isError, error } = useCurrentUser()
  const updateProfile = useUpdateProfile()
  const { showToast } = useToast()
  const [isEditing, setIsEditing] = useState(false)

  function startEditing() {
    updateProfile.reset()
    setIsEditing(true)
  }

  async function handleSave(values: AccountFormValues) {
    if (!data) return
    const patch = buildProfilePatch(values, data)
    if (Object.keys(patch).length === 0) {
      setIsEditing(false)
      return
    }
    try {
      await updateProfile.mutateAsync(patch)
      setIsEditing(false)
      showToast({ message: 'Profile updated', variant: 'success' })
    } catch {
      // Stay in edit mode with the user's typed values intact — the error
      // is read off updateProfile.error and rendered inside the form below.
    }
  }

  const addressLine = data?.addressLine1
    ? [data.addressLine1, data.addressLine2, data.city, data.state, data.postalCode, data.country]
        .filter(Boolean)
        .join(', ')
    : 'No address on file yet.'

  return (
    <Page>
      <Seo title="My account" noindex />
      <h1>My account</h1>

      {isLoading && <Skeleton className={styles.skeleton} label="Loading your account" />}
      {isError && <Alert variant="error">{getApiErrorMessage(error)}</Alert>}

      {data && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Profile</h2>
              {!isEditing && (
                <Button variant="secondary" onClick={startEditing}>
                  Edit profile
                </Button>
              )}
            </div>

            {!isEditing ? (
              <>
                <dl className={styles.details}>
                  <dt>Email</dt>
                  <dd>{data.email}</dd>
                  <dt>Address</dt>
                  <dd>{addressLine}</dd>
                  <dt>Phone</dt>
                  <dd>{data.phone ?? 'Not provided'}</dd>
                </dl>
              </>
            ) : (
              <ProfileForm
                profile={data}
                isSubmitting={updateProfile.isPending}
                submitError={updateProfile.isError ? getApiErrorMessage(updateProfile.error) : null}
                onSubmit={(values) => void handleSave(values)}
                onCancel={() => setIsEditing(false)}
              />
            )}
          </div>

          <div className={styles.side}>
            <Link to={ROUTES.ORDERS} className={styles.linkCard}>
              <Package size={20} aria-hidden="true" />
              <span className={styles.linkCardBody}>
                <span className={styles.linkCardTitle}>Your orders</span>
                <span className={styles.linkCardText}>Track orders and download invoices</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Sign out</h2>
              <p className={styles.signOutText}>
                End your session on this device.
              </p>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}
