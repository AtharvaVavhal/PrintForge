import { REQUIRE_PERMISSION_KEY } from '../auth/permissions/require-permission.decorator';
import type { Permission } from '../auth/permissions/permission';
import { ProductsController } from './products.controller';

/**
 * PermissionsGuard (global, app.module.ts) reads this exact metadata key off
 * the handler to decide whether to reject a caller lacking the permission —
 * this test proves the new route carries it, without booting the whole app
 * or hand-mocking an ExecutionContext. The guard's own denial behavior
 * (`Insufficient permission for this resource`, 403) is generic and already
 * covered wherever it's tested for the rest of the admin surface; nothing
 * about *this* route's denial path is special.
 *
 * Phase 3 (decisions P2-D9, G-13, G-20): replaces the old
 * `@Roles(Role.ADMIN)` / `RolesGuard` version of this same test.
 */
describe('ProductsController.reactivate — permission gate', () => {
  it('is decorated with @RequirePermission("products:write"), same as the deactivate (remove) route', () => {
    // Reflect.getMetadata reads the decorator's metadata off the method —
    // it never invokes it, so there's no real unbound-`this` risk here;
    // this is the standard way to introspect a NestJS route decorator
    // without booting the app.
    /* eslint-disable @typescript-eslint/unbound-method */
    const reactivatePermission = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      ProductsController.prototype.reactivate,
    ) as Permission | undefined;
    const removePermission = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      ProductsController.prototype.remove,
    ) as Permission | undefined;
    /* eslint-enable @typescript-eslint/unbound-method */

    expect(reactivatePermission).toEqual('products:write');
    expect(reactivatePermission).toEqual(removePermission);
  });
});
