import { z } from 'zod'

/**
 * Mirrors backend/src/auth/dto/validators/password-policy.constraint.ts
 * exactly (same blocklist, same "not purely numeric" rule) so the form
 * gives the same verdict the server will — this is a UX convenience only,
 * the server re-validates independently and is the actual source of truth.
 * Keep this list in sync if that file's blocklist ever changes.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'letmein1',
  'qwertyui',
  'qwerty123',
  'iloveyou',
  'admin1234',
  'welcome1',
  'abc12345',
  '12345678',
  '123456789',
])

const emailSchema = z.email('Enter a valid email address')

/** The one min-length the backend enforces (RegisterDto @MinLength(8)). */
export const PASSWORD_MIN_LENGTH = 8

const isPurelyNumeric = (value: string) => /^\d+$/.test(value)
const isCommonPassword = (value: string) => COMMON_PASSWORDS.has(value.toLowerCase())

/**
 * The three checks the register / reset-password policy actually performs,
 * as a checklist the form can show inline (UX-24). Each `isMet` mirrors
 * exactly what `passwordSchema` below (and the backend
 * PasswordPolicyConstraint) tests — no new rules are introduced. The
 * "not …" checks require a non-empty value so an untouched field shows
 * every item as still-to-do rather than pre-satisfied.
 */
export const PASSWORD_REQUIREMENTS = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    isMet: (value: string) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'notNumeric',
    label: 'Not only numbers',
    isMet: (value: string) => value.length > 0 && !isPurelyNumeric(value),
  },
  {
    id: 'notCommon',
    label: 'Not a commonly used password',
    isMet: (value: string) => value.length > 0 && !isCommonPassword(value),
  },
] as const

/** Matches RegisterDto/PasswordResetConfirmDto: @IsString @MinLength(8)
 * @Validate(PasswordPolicyConstraint). Kept in lock-step with
 * PASSWORD_REQUIREMENTS above via the shared predicates. */
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .refine((value) => !isPurelyNumeric(value), {
    message: 'Password must not be purely numeric',
  })
  .refine((value) => !isCommonPassword(value), {
    message: 'This password is too common — please choose another',
  })

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>

/** LoginDto only requires @IsNotEmpty on password — no min-length here,
 * deliberately, so a change to the register policy never locks out an
 * existing account with an older, shorter password. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
