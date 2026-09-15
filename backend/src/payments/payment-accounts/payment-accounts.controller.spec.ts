import { REQUIRE_PERMISSION_KEY } from '../../auth/permissions/require-permission.decorator';
import { PaymentAccountsController } from './payment-accounts.controller';

/**
 * P8-4 — authorization. `PermissionsGuard` reads this exact metadata key
 * (set by the class-level `@RequirePermission(...)` decorator) off the
 * controller to decide access — same mechanism `team.controller.ts` uses,
 * proven end-to-end for that controller in
 * `test/e2e/team-management.e2e-spec.ts`. This test confirms the new
 * controller is wired to the already-ratified `payment-account:manage`
 * permission (Phase 3 catalogue, OWNER-only, reserved until this stage)
 * and not, say, left unguarded or pointed at the wrong string.
 */
describe('PaymentAccountsController — authorization', () => {
  it('requires the payment-account:manage permission at the class level', () => {
    const permission = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      PaymentAccountsController,
    );
    expect(permission).toBe('payment-account:manage');
  });
});
