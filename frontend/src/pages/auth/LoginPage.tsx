import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useApiError } from '@/hooks/useApiError'
import { loginSchema, type LoginFormValues } from '@/schemas/auth.schema'
import { ROUTES } from '@/constants/routes'
import { AuthFormShell } from '@/features/auth/AuthFormShell'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import shellStyles from '@/features/auth/AuthFormShell.module.css'

interface LocationState {
  from?: { pathname: string }
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { message: formError, captureError, clearError } = useApiError()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginFormValues) {
    clearError()
    try {
      await login(values.email, values.password)
      const state = location.state as LocationState | null
      void navigate(state?.from?.pathname ?? ROUTES.HOME, { replace: true })
    } catch (error) {
      captureError(error)
    }
  }

  return (
    <AuthFormShell
      title="Log in"
      subtitle="Welcome back to PrintForge."
      footer={
        <>
          Don&apos;t have an account? <Link to={ROUTES.REGISTER}>Sign up</Link>
          <br />
          <Link to={ROUTES.FORGOT_PASSWORD}>Forgot your password?</Link>
        </>
      }
    >
      <form className={shellStyles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" isLoading={isSubmitting} className={shellStyles.submit}>
          Log in
        </Button>
      </form>
    </AuthFormShell>
  )
}
