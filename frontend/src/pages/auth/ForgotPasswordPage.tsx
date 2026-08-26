import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from '@/schemas/auth.schema'
import { requestPasswordResetRequest } from '@/services/api/auth'
import { useApiError } from '@/hooks/useApiError'
import { ROUTES } from '@/constants/routes'
import { AuthFormShell } from '@/features/auth/AuthFormShell'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import shellStyles from '@/features/auth/AuthFormShell.module.css'

export function ForgotPasswordPage() {
  const { message: formError, captureError, clearError } = useApiError()
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) })

  async function onSubmit(values: ForgotPasswordFormValues) {
    clearError()
    try {
      await requestPasswordResetRequest(values.email)
      setSubmitted(true)
    } catch (error) {
      captureError(error)
    }
  }

  return (
    <AuthFormShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={<Link to={ROUTES.LOGIN}>Back to log in</Link>}
    >
      {submitted ? (
        <Alert variant="success">
          If an account exists for this email, a password reset link has been sent.
        </Alert>
      ) : (
        <form className={shellStyles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Button type="submit" isLoading={isSubmitting} className={shellStyles.submit}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthFormShell>
  )
}
