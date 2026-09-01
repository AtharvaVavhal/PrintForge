import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { cn } from '@/utils/cn'
import styles from './ContactPage.module.css'

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

type ContactFormValues = z.infer<typeof contactSchema>

// TODO: client to provide final Contact page copy and real backend endpoint
export function ContactPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormValues>({ resolver: zodResolver(contactSchema) })

  const onSubmit = async (values: ContactFormValues): Promise<void> => {
    await Promise.resolve()
    // No backend endpoint yet – log to console and show success toast
    console.log('Contact form submission (demo):', values)
    alert('Thank you for reaching out! This demo does not send real emails.')
    reset()
  }

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void handleSubmit(onSubmit)(e)
  }

  return (
    <section className={styles.page}>
      <h1>Contact Us</h1>
      <p className={styles.intro}>
        Have a question or need assistance? Fill out the form below and we&apos;ll
        get back to you as soon as possible.
      </p>

      <form className={styles.form} onSubmit={handleFormSubmit} noValidate>
        <TextField
          label="Full name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Subject"
          autoComplete="off"
          error={errors.subject?.message}
          {...register('subject')}
        />
        <div className={cn(styles.field, styles.textAreaField)}>
          <label htmlFor="message" className={styles.label}>
            Message
          </label>
          <textarea
            id="message"
            rows={6}
            autoComplete="off"
            className={cn(styles.input, errors.message && styles.inputError)}
            aria-invalid={errors.message ? 'true' : 'false'}
            aria-describedby={errors.message ? 'message-error' : undefined}
            {...register('message')}
          />
          {errors.message && (
            <p id="message-error" className={styles.error} role="alert">
              {errors.message.message}
            </p>
          )}
        </div>
        <Button type="submit" isLoading={isSubmitting} className={styles.submit}>
          Send Message
        </Button>
      </form>

      <Alert variant="info">
        <strong>Note:</strong> This contact form is a UI demonstration. No real email
        is sent in the current demo environment.
      </Alert>
    </section>
  )
}
