import { IsUUID } from 'class-validator';

/** Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2 Part D) — `POST
 * /admin/subscription/downgrade` body. Same validation posture as
 * `UpgradeSubscriptionDto` — well-formed UUID only, existence checked
 * downstream. */
export class DowngradeSubscriptionDto {
  @IsUUID()
  toPlanId!: string;
}
