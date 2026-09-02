import type { AdminBadgeVariant } from '@/components/admin/AdminBadge'
import type { ReviewStatus } from '@/types/reviews'

export interface ReviewStatusInfo {
  label: string
  variant: AdminBadgeVariant
}

/** Presentation-only mapping — no business logic, no transition rules.
 * `REMOVED` is the author's soft-delete state; the wording stays neutral
 * rather than implying an admin action. */
const REVIEW_STATUS_INFO: Record<ReviewStatus, ReviewStatusInfo> = {
  PUBLISHED: { label: 'Published', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  REMOVED: { label: 'Removed', variant: 'neutral' },
}

export function reviewStatusInfo(status: ReviewStatus): ReviewStatusInfo {
  return REVIEW_STATUS_INFO[status]
}
