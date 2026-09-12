import { PrismaClient } from '@prisma/client';
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  LIMIT_KEY_PERIODS,
  type FeatureKey,
  type LimitKey,
} from '../src/platform/platform-plans/catalogue.constants';

/**
 * Phase 6 W5 — the business-approved Free-plan catalogue.
 *
 * Source of approval: "PHASE 6 — W5 FREE PLAN CATALOGUE CONFIGURATION"
 * (2026-09-12), recorded in docs/saas/DECISIONS.md. These are the ONLY
 * commercial values this repository is authorized to write for the `free`
 * Plan — do not add, remove, or renumber a key here without a new, equally
 * explicit business approval.
 *
 * This module is the SOLE place these values are written. Every canonical
 * Free-plan bootstrap entry point (`prisma/seed-tenant-bootstrap.ts`,
 * `prisma/backfill/dev-scratch-seed-phase2b-equivalent.ts`) calls
 * `seedFreePlanCatalogue()` rather than writing its own PlanFeature/
 * PlanLimit rows, so the approved values can never drift between bootstrap
 * entry points.
 *
 * Deliberately colocated under `prisma/`, not `src/` — same reasoning as
 * every other seed/backfill script in this repo (`phase6-w1-plan-backfill
 * .ts`, `w9-app-setting-backfill.ts`): this is bootstrap/operational
 * tooling, not application runtime code, even though it imports the
 * application's own catalogue constants as its single source of truth for
 * which keys exist (`prisma/backfill/w9-app-setting-backfill.ts` already
 * establishes the `prisma/*` -> `../src/*` import precedent).
 */

export const FREE_PLAN_FEATURES: Readonly<Record<FeatureKey, boolean>> = {
  coupons: true,
  team_members: true,
  custom_domain: false,
  custom_storefront: false,
  custom_branding: false,
  advanced_analytics: false,
  api_access: false,
};

export const FREE_PLAN_LIMITS: Readonly<Record<LimitKey, number | null>> = {
  products: 100,
  team_members: 2,
  orders_per_month: 100,
  storage_mb: 1024,
  custom_domains: 0,
};

export interface FreePlanCatalogueResult {
  featuresWritten: number;
  limitsWritten: number;
}

/**
 * Idempotently upserts exactly the approved Free-plan `PlanFeature`/
 * `PlanLimit` catalogue for the given `planId`.
 *
 * Iterates the code-defined `FEATURE_KEYS`/`LIMIT_KEYS` catalogue (never
 * `Object.keys()` on the maps above) so a key present in the platform's
 * own catalogue but missing from the approved maps fails to type-check
 * rather than silently omitting a row.
 *
 * Every write is an `upsert` keyed on the model's own `(planId,
 * featureKey)` / `(planId, limitKey)` unique constraint
 * (`prisma/schema.prisma` — `PlanFeature`/`PlanLimit` `@@unique`) — safe to
 * call on every bootstrap run, for any number of runs:
 *   - a first run CREATEs all 12 rows (7 features + 5 limits);
 *   - every subsequent run UPDATEs those same 12 rows back to the approved
 *     values (converges local/manually-edited state to the approved
 *     catalogue rather than silently leaving drift in place) and creates
 *     NOTHING new — row counts never grow past 7/5 for this plan.
 * Never touches any plan other than `planId`, and never creates or deletes
 * a `Plan` row itself (the caller owns Plan creation/lookup).
 */
export async function seedFreePlanCatalogue(
  prisma: PrismaClient,
  planId: string,
): Promise<FreePlanCatalogueResult> {
  let featuresWritten = 0;
  for (const featureKey of FEATURE_KEYS) {
    const enabled = FREE_PLAN_FEATURES[featureKey];
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId, featureKey } },
      update: { enabled },
      create: { planId, featureKey, enabled },
    });
    featuresWritten++;
  }

  let limitsWritten = 0;
  for (const limitKey of LIMIT_KEYS) {
    const limitValue = FREE_PLAN_LIMITS[limitKey];
    const period = LIMIT_KEY_PERIODS[limitKey];
    await prisma.planLimit.upsert({
      where: { planId_limitKey: { planId, limitKey } },
      update: { limitValue, period },
      create: { planId, limitKey, limitValue, period },
    });
    limitsWritten++;
  }

  return { featuresWritten, limitsWritten };
}
