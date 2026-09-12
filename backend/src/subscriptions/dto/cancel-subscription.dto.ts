import { IsBoolean } from 'class-validator';

/** Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2 Parts B/C) — `POST
 * /admin/subscription/cancel` body. Required, not optional/defaulted —
 * the caller must say which mode it wants. `atPeriodEnd: false` is the
 * P7-D2 Part B immediate-cancellation path (`SubscriptionService
 * .cancel()`, ACTIVE -> CANCELLED); `atPeriodEnd: true` is the P7-D2
 * Part C scheduled path (`SubscriptionService.scheduleCancellation()`,
 * status unchanged). No un-scheduling flag exists here — Part C
 * explicitly defers that operation; this DTO has no field for it. */
export class CancelSubscriptionDto {
  @IsBoolean()
  atPeriodEnd!: boolean;
}
