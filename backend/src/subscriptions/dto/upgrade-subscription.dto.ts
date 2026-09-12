import { IsUUID } from 'class-validator';

/** Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2) — `POST
 * /admin/subscription/upgrade` body. `toPlanId` is validated as a
 * well-formed UUID here (matches `Plan.id`'s own `@default(uuid())`
 * shape) — actual existence is `SubscriptionOrchestrationService`'s own
 * job (and, redundantly but authoritatively, `SubscriptionService
 * .confirmUpgrade`'s internal `assertPlanExists`), never assumed here. */
export class UpgradeSubscriptionDto {
  @IsUUID()
  toPlanId!: string;
}
