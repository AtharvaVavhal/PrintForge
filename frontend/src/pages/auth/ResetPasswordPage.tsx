import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams } from 'react-router-dom'
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from '@/schemas/auth.schema'
import { confirmPasswordResetRequest } from '@/services/api/auth'
import { useApiError } from '@/hooks/useApiError'
import { ROUTES } from '@/constants/routes'
import { AuthFormShell } from '@/features/auth/AuthFormShell'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import shellStyles from '@/features/auth/AuthFormShell.module.css'

/** Token arrives as a query param on the link the confirmation email sends
 * (`/reset-password?token=...`) — never typed by the user, so it's read
 * from the URL rather than being a form field. */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { message: formError, captureError, setCustomError, clearError } = useApiError()
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) })

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) {
      setCustomError('This reset link is missing its token. Please request a new one.')
      return
    }
    clearError()
    try {
      await confirmPasswordResetRequest(token, values.newPassword)
      setSubmitted(true)
    } catch (error) {
      captureError(error)
    }
  }

  if (!token) {
    return (
      <AuthFormShell title="Reset your password">
        <Alert variant="error">
          This reset link is invalid or missing its token. Please request a new one.
        </Alert>
        <p className={shellStyles.centered}>
          <Link to={ROUTES.FORGOT_PASSWORD}>Request a new reset link</Link>
        </p>
      </AuthFormShell>
    )
  }

  return (
    <AuthFormShell
      title="Choose a new password"
      footer={<Link to={ROUTES.LOGIN}>Back to log in</Link>}
    >
      {submitted ? (
        <Alert variant="success">Password has been reset. Please log in again.</Alert>
      ) : (
        <form className={shellStyles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" isLoading={isSubmitting} className={shellStyles.submit}>
            Reset password
          </Button>
        </form>
      )}
    </AuthFormShell>
  )
}
