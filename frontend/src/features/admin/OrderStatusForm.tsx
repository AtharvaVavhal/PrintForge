import { useState } from 'react'
import type { FormEvent } from 'react'
import { ORDER_STATUS_LABELS } from '@/features/orders/orderStatus'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import type { OrderStatus } from '@/types/orders'
import styles from './OrderStatusForm.module.css'

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

interface OrderStatusFormProps {
  currentStatus: OrderStatus
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (status: OrderStatus, reason: string) => void
}

/**
 * Offers every OrderStatus as a candidate — not just the ones legal from
 * `currentStatus`. The transition table (order-state-machine.ts) is
 * backend-owned and unit-tested there; this form has no business
 * duplicating it. Submitting an illegal transition is expected to fail —
 * the backend's 409 comes back through `submitError`, rendered the same
 * way any other mutation error is (Alert, getApiErrorMessage), not
 * pre-empted by a disabled option here.
 */
export function OrderStatusForm({ currentStatus, isSubmitting, submitError, onSubmit }: OrderStatusFormProps) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus)
  const [reason, setReason] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(status, reason.trim())
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className={styles.field}>
        <label htmlFor="order-status-select" className={styles.label}>
          Change status
        </label>
        <select
          id="order-status-select"
          className={styles.select}
          value={status}
          onChange={(event) => setStatus(event.target.value as OrderStatus)}
        >
          {ALL_STATUSES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {ORDER_STATUS_LABELS[candidate]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="order-status-reason" className={styles.label}>
          Reason (optional)
        </label>
        <input
          id="order-status-reason"
          className={styles.input}
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <Button type="submit" isLoading={isSubmitting} disabled={status === currentStatus}>
        Update status
      </Button>
    </form>
  )
}
