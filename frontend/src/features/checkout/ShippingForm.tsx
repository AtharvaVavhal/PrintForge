import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { shippingSchema, type ShippingFormValues } from '@/schemas/checkout.schema'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import styles from './ShippingForm.module.css'

interface ShippingFormProps {
  onSubmit: (values: ShippingFormValues) => void
  isSubmitting: boolean
  isScriptLoading?: boolean
}

/** Collects shipping details for a fresh checkout — not read from the
 * user's profile (checkout owns collecting it, not validating profile
 * completeness; §11 "Immutable shipping snapshot"). */
export function ShippingForm({ onSubmit, isSubmitting, isScriptLoading }: ShippingFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ShippingFormValues>({ resolver: zodResolver(shippingSchema) })

  const isDisabled = isSubmitting || isScriptLoading

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      <TextField
        label="Recipient name"
        autoComplete="name"
        error={errors.shippingRecipientName?.message}
        {...register('shippingRecipientName')}
        disabled={isDisabled}
      />
      <TextField
        label="Phone number"
        type="tel"
        autoComplete="tel"
        error={errors.shippingPhone?.message}
        {...register('shippingPhone')}
        disabled={isDisabled}
      />
      <TextField
        label="Address line 1"
        autoComplete="address-line1"
        error={errors.shippingAddressLine1?.message}
        {...register('shippingAddressLine1')}
        disabled={isDisabled}
      />
      <TextField
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        error={errors.shippingAddressLine2?.message}
        {...register('shippingAddressLine2')}
        disabled={isDisabled}
      />
      <div className={styles.row}>
        <TextField
          label="City"
          autoComplete="address-level2"
          error={errors.shippingCity?.message}
          {...register('shippingCity')}
          disabled={isDisabled}
        />
        <TextField
          label="State"
          autoComplete="address-level1"
          error={errors.shippingState?.message}
          {...register('shippingState')}
          disabled={isDisabled}
        />
      </div>
      <div className={styles.row}>
        <TextField
          label="Postal code"
          autoComplete="postal-code"
          error={errors.shippingPostalCode?.message}
          {...register('shippingPostalCode')}
          disabled={isDisabled}
        />
        <TextField
          label="Country"
          autoComplete="country-name"
          error={errors.shippingCountry?.message}
          {...register('shippingCountry')}
          disabled={isDisabled}
        />
      </div>

      <Button type="submit" isLoading={isDisabled} className={styles.submit} disabled={isDisabled}>
        {isScriptLoading ? 'Loading payment…' : 'Pay now'}
      </Button>
    </form>
  )
}
