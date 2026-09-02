import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useValidateCheckout } from '@/hooks/useValidateCheckout'
import {
  checkoutCouponSchema,
  toValidateCheckoutPayload,
  type CheckoutCouponFormValues,
} from '@/schemas/coupon.schema'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { formatPrice } from '@/utils/formatPrice'
import { getApiErrorMessage } from '@/utils/apiError'
import type { CheckoutPreviewView } from '@/types/coupons'
import styles from './CouponForm.module.css'

interface CouponFormProps {
  appliedPreview: CheckoutPreviewView | null
  onApplied: (preview: CheckoutPreviewView | null) => void
}

const EMPTY_VALUES: CheckoutCouponFormValues = { couponCode: '' }

/**
 * POST /checkout/validate on explicit submit only — never on keystroke.
 * A read-only preview against the current cart, never authoritative: the
 * applied code is threaded through to the real POST /checkout/orders call
 * (CheckoutPage.tsx), which re-validates and claims it for real inside
 * the order-creation transaction. Each of CouponsService's failure
 * reasons (invalid code, expired, not yet active, usage-limit-exhausted,
 * per-user-limit-reached, below-minimum-order, first-order-only,
 * scope-mismatch) already has its own specific message server-side —
 * rendered here as-is via getApiErrorMessage, never collapsed into one
 * generic "invalid coupon" string.
 */
export function CouponForm({ appliedPreview, onApplied }: CouponFormProps) {
  const validateCheckout = useValidateCheckout()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CheckoutCouponFormValues>({
    resolver: zodResolver(checkoutCouponSchema),
    defaultValues: EMPTY_VALUES,
  })

  async function handleApply(values: CheckoutCouponFormValues) {
    try {
      const preview = await validateCheckout.mutateAsync(toValidateCheckoutPayload(values))
      onApplied(preview)
    } catch {
      // Error surfaced via validateCheckout.isError below; input stays as typed.
    }
  }

  function handleRemove() {
    validateCheckout.reset()
    reset(EMPTY_VALUES)
    onApplied(null)
  }

  if (appliedPreview) {
    return (
      <div className={styles.wrap}>
        <div className={styles.appliedRow}>
          <span className={styles.appliedLabel}>
            Coupon <strong>{appliedPreview.couponCode}</strong> applied
          </span>
          <Button type="button" variant="ghost" onClick={handleRemove}>
            Remove
          </Button>
        </div>

        <dl className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <dt>Subtotal</dt>
            <dd>{formatPrice(appliedPreview.subtotal)}</dd>
          </div>
          <div className={styles.breakdownRow}>
            <dt>Shipping</dt>
            <dd>{formatPrice(appliedPreview.shippingFee)}</dd>
          </div>
          {Number(appliedPreview.discountAmount) > 0 && (
            <div className={styles.breakdownRow}>
              <dt>Discount</dt>
              <dd className={styles.discount}>−{formatPrice(appliedPreview.discountAmount)}</dd>
            </div>
          )}
          {Number(appliedPreview.taxAmount) > 0 && (
            <div className={styles.breakdownRow}>
              <dt>
                GST
                {appliedPreview.taxMode === 'INCLUSIVE' ? ' (included)' : ''}
              </dt>
              <dd>{formatPrice(appliedPreview.taxAmount)}</dd>
            </div>
          )}
          <div className={styles.breakdownRow}>
            <dt>Total</dt>
            <dd className={styles.total}>{formatPrice(appliedPreview.total)}</dd>
          </div>
        </dl>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(handleApply)(e)} noValidate>
      <div className={styles.inputRow}>
        <TextField
          label="Coupon code"
          error={errors.couponCode?.message}
          {...register('couponCode')}
        />
        <Button type="submit" variant="secondary" isLoading={validateCheckout.isPending}>
          Apply
        </Button>
      </div>
      {validateCheckout.isError && (
        <Alert variant="error">{getApiErrorMessage(validateCheckout.error)}</Alert>
      )}
    </form>
  )
}
