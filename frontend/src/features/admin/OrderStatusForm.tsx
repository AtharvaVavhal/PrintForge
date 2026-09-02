import { useState } from 'react'
import type { FormEvent } from 'react'
import { ORDER_STATUS_LABELS } from '@/features/orders/orderStatus'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/TextField'
import { AdminSelect } from '@/components/admin/AdminSelect'
import type { OrderStatus } from '@/types/orders'
import styles from './OrderStatusForm.module.css'

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

/**
 * Offers every OrderStatus as a candidate — not just the ones legal from
 * `currentStatus`. The transition table (order-state-machine.ts) is
 * backend-owned and unit-tested there; this form never duplicates it.
 * Submitting an illegal transition is expected to fail — the backend's
 * 409 comes back through `submitError`.
 *
 * A pick that moves the order to a terminal state (CANCELLED / REFUNDED)
 * opens a confirmation first — the backend still owns legality, this only
 * decides which choices deserve a second look before submitting.
 */
const CONFIRM_COPY: Partial<Record<OrderStatus, { title: string; body: string; cta: string }>> = {
  CANCELLED: {
    title: 'Cancel this order?',
    body: 'The order moves to Cancelled — a terminal state. Do this only if it will not be fulfilled.',
    cta: 'Cancel order',
  },
  REFUNDED: {
    title: 'Mark this order as refunded?',
    body: 'Record this only after the refund has actually been processed in the Razorpay dashboard. Refunded is a terminal state.',
    cta: 'Mark refunded',
  },
}

interface OrderStatusFormProps {
  currentStatus: OrderStatus
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (status: OrderStatus, reason: string) => void
}

export function OrderStatusForm({
  currentStatus,
  isSubmitting,
  submitError,
  onSubmit,
}: OrderStatusFormProps) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus)
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const unchanged = status === currentStatus
  const confirmCopy = CONFIRM_COPY[status]

  function submit() {
    onSubmit(status, reason.trim())
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (unchanged) return
    if (confirmCopy) {
      setConfirmOpen(true)
      return
    }
    submit()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <AdminSelect
        label="Change status"
        name="status"
        value={status}
        onChange={(event) => setStatus(event.target.value as OrderStatus)}
      >
        {ALL_STATUSES.map((candidate) => (
          <option key={candidate} value={candidate}>
            {ORDER_STATUS_LABELS[candidate]}
          </option>
        ))}
      </AdminSelect>

      <TextField
        label="Reason (optional)"
        name="reason"
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting && !confirmOpen} disabled={unchanged}>
          Update status
        </Button>
      </div>

      <Modal
        isOpen={confirmOpen && confirmCopy !== undefined}
        onClose={() => setConfirmOpen(false)}
        title={confirmCopy?.title ?? ''}
        size="sm"
      >
        {confirmCopy && (
          <div className={styles.confirm}>
            <p>{confirmCopy.body}</p>
            <div className={styles.confirmActions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={isSubmitting}
              >
                Keep as is
              </Button>
              <Button
                type="button"
                isLoading={isSubmitting}
                onClick={() => {
                  submit()
                  setConfirmOpen(false)
                }}
              >
                {confirmCopy.cta}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </form>
  )
}
