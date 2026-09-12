import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../../../src/auth/permissions/require-permission.decorator';
import { RequireFeature } from '../../../src/entitlements/require-feature.decorator';

/**
 * Phase 6 W4 — test-only controller. Exists solely so
 * `entitlement-guard.e2e-spec.ts` can exercise the REAL, globally-registered
 * guard chain (`TenantContextGuard -> TenantLifecycleGuard -> PermissionsGuard
 * -> EntitlementGuard`) end-to-end against a real Postgres-backed
 * `EntitlementService`, without mocking any guard. Never wired into
 * `app.module.ts` / the real shipped application — only compiled into the
 * test app via `test-app.ts#createTestAppWithExtraModules`, which that one
 * e2e file uses instead of the shared `createTestApp()`. This is not a
 * decision to gate any REAL business route behind `@RequireFeature` — no
 * existing controller in `src/` is touched by W4 at all (see
 * `entitlement-guard.e2e-spec.ts`'s own regression test against a real,
 * unmodified route for that guarantee).
 *
 * `@RequirePermission('dashboard:read')` is used because it is the one
 * permission every tenant role (OWNER/ADMIN/STAFF/VIEWER) already holds
 * (G-13's ratified catalogue) — these routes exist to prove FEATURE
 * composition, not to re-test permission RBAC (already covered by
 * `permissions.guard.spec.ts` and the tenant-control-plane e2e suites).
 */
@Controller('test-support/entitlement')
export class EntitlementTestController {
  @Get('coupons-gated')
  @RequirePermission('dashboard:read')
  @RequireFeature('coupons')
  couponsGated(): { ok: true; gatedBy: 'coupons' } {
    return { ok: true, gatedBy: 'coupons' };
  }

  @Get('team-members-gated')
  @RequirePermission('dashboard:read')
  @RequireFeature('team_members')
  teamMembersGated(): { ok: true; gatedBy: 'team_members' } {
    return { ok: true, gatedBy: 'team_members' };
  }
}
