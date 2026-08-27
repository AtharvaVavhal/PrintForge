import { useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
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
  const [isEditing, setIsEditing] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  function startEditing() {
    updateProfile.reset()
    setJustSaved(false)
    setIsEditing(true)
  }

  async function handleSave(values: AccountFormValues) {
    if (!data) return
    const patch = buildProfilePatch(values, data)
    if (Object.keys(patch).length === 0) {
      // Nothing actually changed — no reason to round-trip an empty PATCH.
      setIsEditing(false)
      return
    }
    try {
      await updateProfile.mutateAsync(patch)
      setIsEditing(false)
      setJustSaved(true)
    } catch {
      // Stay in edit mode with the user's typed values intact — the error
      // itself is read off updateProfile.error and rendered inside the
      // still-mounted form below.
    }
  }

  return (
    <section className={styles.wrap}>
      <h1>My account</h1>

      {isLoading && <p>Loading your profile…</p>}
      {isError && <Alert variant="error">{getApiErrorMessage(error)}</Alert>}

      {data && !isEditing && (
        <>
          {justSaved && <Alert variant="success">Your profile has been updated.</Alert>}

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

          <Button className={styles.editButton} onClick={startEditing}>
            Edit profile
          </Button>
        </>
      )}

      {data && isEditing && (
        <ProfileForm
          profile={data}
          isSubmitting={updateProfile.isPending}
          submitError={updateProfile.isError ? getApiErrorMessage(updateProfile.error) : null}
          onSubmit={(values) => void handleSave(values)}
          onCancel={() => setIsEditing(false)}
        />
      )}
    </section>
  )
}
