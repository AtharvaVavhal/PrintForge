import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { shippingSchema, type ShippingFormValues } from '@/schemas/checkout.schema'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import styles from './ShippingForm.module.css'

interface ShippingFormProps {
  onSubmit: (values: ShippingFormValues) => void
  isSubmitting: boolean
  /** True only while the Razorpay Checkout.js script is loading — it gates
   * the final submit action, never the fields (UX-05): the script loads
   * after "Pay now", so blocking data entry on it is never correct. */
  isScriptLoading?: boolean
  /** Saved shipping details from the customer's profile — used as the
   * form's initial values so a returning customer doesn't re-type their
   * address (UX-07). Every field stays freely editable. */
  defaultValues?: Partial<ShippingFormValues>
  /** Show the "prefilled from your saved address" hint. */
  prefilled?: boolean
}

const EMPTY_VALUES: ShippingFormValues = {
  shippingRecipientName: '',
  shippingPhone: '',
  shippingAddressLine1: '',
  shippingAddressLine2: '',
  shippingCity: '',
  shippingState: '',
  shippingPostalCode: '',
  shippingCountry: '',
}

/** Collects shipping details for a fresh checkout. Initial values may be
 * seeded from the customer's saved profile address (§11 still keeps an
 * immutable snapshot onto the order regardless). */
export function ShippingForm({
  onSubmit,
  isSubmitting,
  isScriptLoading,
  defaultValues,
  prefilled = false,
}: ShippingFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ShippingFormValues>({
    resolver: zodResolver(shippingSchema),
    defaultValues: { ...EMPTY_VALUES, ...defaultValues },
  })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {prefilled && (
        <p className={styles.prefilledNote}>
          Prefilled from your saved address — edit any field as needed.
        </p>
      )}
      <TextField
        label="Recipient name"
        autoComplete="name"
        error={errors.shippingRecipientName?.message}
        {...register('shippingRecipientName')}
        disabled={isSubmitting}
      />
      <TextField
        label="Phone number"
        type="tel"
        autoComplete="tel"
        error={errors.shippingPhone?.message}
        {...register('shippingPhone')}
        disabled={isSubmitting}
      />
      <TextField
        label="Address line 1"
        autoComplete="address-line1"
        error={errors.shippingAddressLine1?.message}
        {...register('shippingAddressLine1')}
        disabled={isSubmitting}
      />
      <TextField
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        error={errors.shippingAddressLine2?.message}
        {...register('shippingAddressLine2')}
        disabled={isSubmitting}
      />
      <div className={styles.row}>
        <TextField
          label="City"
          autoComplete="address-level2"
          error={errors.shippingCity?.message}
          {...register('shippingCity')}
          disabled={isSubmitting}
        />
        <TextField
          label="State"
          autoComplete="address-level1"
          error={errors.shippingState?.message}
          {...register('shippingState')}
          disabled={isSubmitting}
        />
      </div>
      <div className={styles.row}>
        <TextField
          label="Postal code"
          autoComplete="postal-code"
          error={errors.shippingPostalCode?.message}
          {...register('shippingPostalCode')}
          disabled={isSubmitting}
        />
        <TextField
          label="Country"
          autoComplete="country-name"
          error={errors.shippingCountry?.message}
          {...register('shippingCountry')}
          disabled={isSubmitting}
        />
      </div>

      <Button
        type="submit"
        isLoading={isSubmitting}
        className={styles.submit}
        disabled={isSubmitting || isScriptLoading}
      >
        {isScriptLoading ? 'Loading payment…' : 'Pay now'}
      </Button>
    </form>
  )
}
