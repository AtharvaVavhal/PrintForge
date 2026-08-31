import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import styles from './NewsletterForm.module.css'

const newsletterSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type NewsletterFormValues = z.infer<typeof newsletterSchema>

export function NewsletterForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewsletterFormValues>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (data: NewsletterFormValues) => {
    setStatus('submitting')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setStatus('success')
    reset()
    setTimeout(() => setStatus('idle'), 3000)
    void data
  }

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleSubmit(onSubmit)()
  }

  return (
    <section className={styles.section} aria-labelledby="newsletter-heading">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 id="newsletter-heading" className={styles.heading}>
            Stay Updated
          </h2>
          <p className={styles.subtext}>
            Get the latest designs, offers, and inspiration delivered to your inbox.
          </p>
        </div>
        <form onSubmit={handleFormSubmit} className={styles.form} noValidate>
          <div className={styles.inputGroup}>
            <label htmlFor="newsletter-email" className={styles.label}>
              Email address
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="newsletter-email"
                type="email"
                placeholder="you@example.com"
                className={cn(styles.input, errors.email && styles.inputError)}
                {...register('email')}
                disabled={status === 'submitting' || status === 'success'}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'newsletter-error' : undefined}
              />
              {status === 'submitting' && <Loader2 size={20} className={styles.spinner} aria-hidden="true" />}
              {status === 'success' && <Check size={20} className={styles.successIcon} aria-hidden="true" />}
            </div>
            {errors.email && (
              <p id="newsletter-error" className={styles.error} role="alert">
                <AlertCircle size={14} aria-hidden="true" />
                {errors.email.message}
              </p>
            )}
          </div>
          <Button type="submit" className={styles.submitBtn} disabled={status === 'submitting' || status === 'success'}>
            {status === 'submitting' ? 'Subscribing...' : status === 'success' ? 'Subscribed!' : 'Subscribe'}
          </Button>
          <p className={styles.disclaimer}>
            By subscribing, you agree to receive marketing emails. No spam, unsubscribe anytime.
          </p>
        </form>
      </div>
    </section>
  )
}
