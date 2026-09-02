import type { OrderStatus } from '@/types/orders'
import { AdminBadge, type AdminBadgeVariant } from '@/components/admin/AdminBadge'
import { ORDER_STATUS_LABELS, orderStatusTone } from './orderStatus'

const TONE_TO_VARIANT: Record<ReturnType<typeof orderStatusTone>, AdminBadgeVariant> = {
  success: 'success',
  error: 'danger',
  info: 'info',
}

/**
 * Order-status pill. Now a thin wrapper over the generic `AdminBadge` —
 * the label text (`ORDER_STATUS_LABELS`) and severity mapping
 * (`orderStatusTone`) are unchanged, so callers and their tests behave
 * identically; only the shared styling/markup moved into `AdminBadge`.
 */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <AdminBadge variant={TONE_TO_VARIANT[orderStatusTone(status)]}>
      {ORDER_STATUS_LABELS[status]}
    </AdminBadge>
  )
}
