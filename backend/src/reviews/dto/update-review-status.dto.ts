import { IsEnum } from 'class-validator';
import { ReviewStatus } from '@prisma/client';

/**
 * Admin-only moderation (PATCH /admin/reviews/:id/status). Unlike order
 * status transitions (§14), there's no legality graph to enforce — any
 * status to any status is a valid moderation action (publish, reject, or
 * pull down a previously-published review), so this is a plain CAS-free
 * write, not a state-machine-gated one.
 */
export class UpdateReviewStatusDto {
  @IsEnum(ReviewStatus)
  status: ReviewStatus;
}
