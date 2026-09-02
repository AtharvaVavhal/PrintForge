import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAdminSettings } from '@/hooks/useAdminSettings'
import { useUpdateAdminSetting } from '@/hooks/useUpdateAdminSetting'
import { schemaForKind } from '@/schemas/adminSettings.schema'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { getApiErrorMessage } from '@/utils/apiError'
import type { AdminSettingView } from '@/services/api/settings'
import styles from './AdminSettingsPage.module.css'

/**
 * Behind AdminRoute (App.tsx). One small form per configurable setting
 * (GET /admin/settings). Every value is re-validated server-side; a
 * "Saved" confirmation only ever appears after the PATCH actually
 * resolves — there is no optimistic / simulated success here.
 *
 * Settings flagged `pendingClientInput` (GST rate, invoice prefix, seller
 * legal name / address / GSTIN / state — Phase 13.4) ship blank and are
 * shown with a "pending client confirmation" notice. Nothing is
 * pre-filled with a guessed value.
 *
 * Homepage hero / banner / showcase content is settings-backed but not
 * exposed here (it needs a structured multi-item editor) — see the phase
 * report.
 */
export function AdminSettingsPage() {
  const settingsQuery = useAdminSettings()

  return (
    <section className={styles.wrap}>
      <h1>Store settings</h1>
      <p className={styles.intro}>
        These values take effect immediately across the storefront and
        checkout. The server validates and is the source of truth for every
        one.
      </p>

      {settingsQuery.isPending && <Skeleton className={styles.skeletonBlock} />}

      {settingsQuery.isError && (
        <Alert variant="error">{getApiErrorMessage(settingsQuery.error)}</Alert>
      )}

      {settingsQuery.data && (
        <div className={styles.list}>
          {settingsQuery.data.map((setting) => (
            <SettingRow key={setting.key} setting={setting} />
          ))}
        </div>
      )}
    </section>
  )
}

interface SettingRowProps {
  setting: AdminSettingView
}

function SettingRow({ setting }: SettingRowProps) {
  const updateSetting = useUpdateAdminSetting()
  const [savedValue, setSavedValue] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<{ value: string }>({
    resolver: zodResolver(schemaForKind(setting.kind)),
    defaultValues: { value: setting.value },
  })

  // Keep the field in sync if the server value changes underneath us
  // (e.g. another admin saved, cache refetched).
  useEffect(() => {
    reset({ value: setting.value })
  }, [setting.value, reset])

  async function onSubmit(values: { value: string }) {
    setSavedValue(null)
    try {
      const updated = await updateSetting.mutateAsync({
        key: setting.key,
        value: values.value,
      })
      reset({ value: updated.value })
      setSavedValue(updated.value)
    } catch {
      // Surfaced via updateSetting.isError below.
    }
  }

  const fieldId = `setting-${setting.key}`
  const isChoice = setting.kind === 'boolean' || setting.kind === 'enum'
  const choiceOptions =
    setting.kind === 'boolean'
      ? ['false', 'true']
      : (setting.options ?? [])

  return (
    <form
      className={styles.row}
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      noValidate
    >
      {isChoice ? (
        <div className={styles.choiceField}>
          <label htmlFor={fieldId} className={styles.choiceLabel}>
            {setting.label}
          </label>
          <select
            id={fieldId}
            className={styles.choiceSelect}
            aria-invalid={Boolean(errors.value)}
            {...register('value')}
          >
            {choiceOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {errors.value && (
            <p className={styles.fieldError} role="alert">
              {errors.value.message}
            </p>
          )}
        </div>
      ) : (
        <TextField
          label={setting.label}
          id={fieldId}
          inputMode={
            setting.kind === 'money' || setting.kind === 'percent'
              ? 'decimal'
              : undefined
          }
          error={errors.value?.message}
          {...register('value')}
        />
      )}

      <p className={styles.help}>{setting.description}</p>

      {setting.pendingClientInput && (
        <Alert variant="info">
          Pending client confirmation — leave blank until the client/accountant
          supplies this value. It is never guessed.
        </Alert>
      )}

      {updateSetting.isError && (
        <Alert variant="error">{getApiErrorMessage(updateSetting.error)}</Alert>
      )}
      {savedValue !== null && !isDirty && (
        <Alert variant="success">
          Saved.{' '}
          {savedValue === ''
            ? 'The value is now blank.'
            : `The value is now “${savedValue}”.`}
        </Alert>
      )}

      <div className={styles.actions}>
        <Button
          type="submit"
          isLoading={updateSetting.isPending}
          disabled={updateSetting.isPending || !isDirty}
        >
          Save
        </Button>
      </div>
    </form>
  )
}
