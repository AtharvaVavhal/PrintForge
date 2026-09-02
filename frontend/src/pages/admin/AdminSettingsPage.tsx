import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAdminSettings } from '@/hooks/useAdminSettings'
import { useUpdateAdminSetting } from '@/hooks/useUpdateAdminSetting'
import { schemaForKind } from '@/schemas/adminSettings.schema'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { AdminPage } from '@/components/admin/AdminPage'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminSelect } from '@/components/admin/AdminSelect'
import { AdminPageSkeleton } from '@/components/admin/AdminPageSkeleton'
import { getApiErrorMessage } from '@/utils/apiError'
import type { AdminSettingView } from '@/services/api/settings'
import styles from './AdminSettingsPage.module.css'

/** Client-side presentation grouping only — derived from the setting
 * `key` prefixes the backend already uses (`tax.*`, `invoice.*`). It
 * adds no configuration and changes no value. */
const GROUPS: { title: string; belongs: (key: string) => boolean }[] = [
  { title: 'Storefront', belongs: (k) => !k.startsWith('tax.') && !k.startsWith('invoice.') },
  { title: 'Tax (GST)', belongs: (k) => k.startsWith('tax.') },
  { title: 'Invoicing', belongs: (k) => k.startsWith('invoice.') },
]

function groupSettings(settings: AdminSettingView[]) {
  return GROUPS.map((group) => ({
    title: group.title,
    settings: settings.filter((s) => group.belongs(s.key)),
  })).filter((group) => group.settings.length > 0)
}

/**
 * Behind AdminRoute (App.tsx). One small form per configurable setting
 * (GET /admin/settings), grouped into cards by key prefix. Every value is
 * re-validated server-side; a "Saved" confirmation only ever appears after
 * the PATCH actually resolves — no optimistic success.
 *
 * Settings flagged `pendingClientInput` (GST rate, invoice prefix, seller
 * legal name / address / GSTIN / state) ship blank and carry a "pending
 * client confirmation" notice. Tax pricing mode's option list comes
 * straight from the API — EXCLUSIVE is locked server-side and simply not
 * offered.
 *
 * Homepage hero / banner / showcase content is settings-backed but not
 * exposed here (it needs a structured multi-item editor).
 */
export function AdminSettingsPage() {
  const settingsQuery = useAdminSettings()

  if (settingsQuery.isPending) {
    return <AdminPageSkeleton rows={4} />
  }

  const groups = settingsQuery.data ? groupSettings(settingsQuery.data) : []

  return (
    <AdminPage
      title="Store settings"
      description="These values take effect immediately across the storefront and checkout. The server validates and is the source of truth for every one."
    >
      {settingsQuery.isError && (
        <Alert variant="error">{getApiErrorMessage(settingsQuery.error)}</Alert>
      )}

      {groups.map((group) => (
        <AdminCard key={group.title} as="section" title={group.title}>
          <div className={styles.group}>
            {group.settings.map((setting) => (
              <SettingRow key={setting.key} setting={setting} />
            ))}
          </div>
        </AdminCard>
      ))}
    </AdminPage>
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
    setting.kind === 'boolean' ? ['false', 'true'] : (setting.options ?? [])

  return (
    <form className={styles.row} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {isChoice ? (
        <AdminSelect
          label={setting.label}
          id={fieldId}
          error={errors.value?.message}
          {...register('value')}
        >
          {choiceOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </AdminSelect>
      ) : (
        <TextField
          label={setting.label}
          id={fieldId}
          inputMode={
            setting.kind === 'money' || setting.kind === 'percent' ? 'decimal' : undefined
          }
          error={errors.value?.message}
          {...register('value')}
        />
      )}

      <p className={styles.help}>{setting.description}</p>

      {setting.pendingClientInput && (
        <Alert variant="info">
          Pending client confirmation — leave blank until the client/accountant supplies this
          value. It is never guessed.
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
