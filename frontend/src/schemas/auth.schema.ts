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

/** Matches RegisterDto/PasswordResetConfirmDto: @IsString @MinLength(8)
 * @Validate(PasswordPolicyConstraint). */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => !/^\d+$/.test(value), {
    message: 'Password must not be purely numeric',
  })
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
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
