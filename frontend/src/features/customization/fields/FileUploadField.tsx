import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { CustomizationField } from '@/types/catalog'
import { useUploadFile } from '@/hooks/useUploadFile'
import { getApiErrorMessage } from '@/utils/apiError'
import styles from './FileUploadField.module.css'

interface FieldConstraints {
  allowedFormats?: string[]
  maxFileSizeMb?: number
}

interface FileUploadFieldProps {
  field: CustomizationField
  value: string
  onChange: (uploadedFileId: string) => void
  error?: string
}

/**
 * Extension, not MIME type — matches the allowedFormats values used
 * throughout prisma/seed-production.ts ('png', 'jpeg', 'pdf'). This is a
 * client-side pre-check for fast feedback only; the server's magic-byte
 * signature check (uploads.service.ts, §24) is the real gate and doesn't
 * trust the extension either.
 */
function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

/**
 * One customization field of type LOGO_UPLOAD/IMAGE_UPLOAD/
 * DESIGN_FILE_UPLOAD. Uploads eagerly on file selection (POST /uploads —
 * the same shared endpoint product-image upload uses) rather than
 * deferring to form submit: this field's form value IS the resulting
 * uploadedFileId (cart/dto/customization-value.dto.ts), so there's
 * nothing else to submit once the upload finishes.
 */
export function FileUploadField({ field, value, onChange, error }: FileUploadFieldProps) {
  const constraints = (field.constraints ?? {}) as FieldConstraints
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const upload = useUploadFile()

  function validateLocally(file: File): string | null {
    if (constraints.allowedFormats?.length) {
      const extension = getExtension(file.name)
      if (!constraints.allowedFormats.includes(extension)) {
        return `${field.label} must be one of: ${constraints.allowedFormats.join(', ')}`
      }
    }
    if (constraints.maxFileSizeMb !== undefined) {
      const maxBytes = constraints.maxFileSizeMb * 1024 * 1024
      if (file.size > maxBytes) {
        return `${field.label} must be at most ${constraints.maxFileSizeMb}MB`
      }
    }
    return null
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const validationError = validateLocally(file)
    if (validationError) {
      setLocalError(validationError)
      setFileName(null)
      onChange('')
      event.target.value = ''
      return
    }

    setLocalError(null)
    setFileName(file.name)
    upload.mutate(file, {
      onSuccess: (uploaded) => onChange(uploaded.id),
      onError: () => {
        onChange('')
        setFileName(null)
      },
    })
  }

  function handleRemove() {
    setFileName(null)
    setLocalError(null)
    onChange('')
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  // localError (client-side format/size pre-check) takes priority over
  // error (RHF/zod, e.g. "required") — once a rejected file clears the
  // field back to blank, the required error would otherwise mask the
  // more specific reason the file was rejected in the first place.
  const displayError =
    localError ?? error ?? (upload.isError ? getApiErrorMessage(upload.error) : undefined)
  const showUploaded = Boolean(value) && Boolean(fileName) && !upload.isPending

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={field.id}>
        {field.label}
        {field.isRequired && <span className={styles.required}> *</span>}
      </label>
      {field.helpText && <p className={styles.helpText}>{field.helpText}</p>}

      {showUploaded ? (
        <div className={styles.uploaded}>
          <span className={styles.fileName}>{fileName}</span>
          <button type="button" className={styles.removeButton} onClick={handleRemove}>
            Remove
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          id={field.id}
          type="file"
          accept={constraints.allowedFormats?.map((format) => `.${format}`).join(',')}
          onChange={handleFileChange}
          disabled={upload.isPending}
          aria-invalid={Boolean(displayError)}
        />
      )}

      {upload.isPending && <p className={styles.status}>Uploading…</p>}
      {displayError && (
        <p className={styles.error} role="alert">
          {displayError}
        </p>
      )}
    </div>
  )
}
