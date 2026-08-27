import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ProductsController } from './products.controller';

/**
 * RolesGuard (global, app.module.ts) reads this exact metadata key off the
 * handler to decide whether to reject a non-admin caller — this test
 * proves the new route carries it, without booting the whole app or
 * hand-mocking an ExecutionContext. The guard's own denial behavior
 * (`Insufficient role for this resource`, 403) is generic and already
 * covered wherever it's tested for the rest of the admin surface; nothing
 * about *this* route's denial path is special. Live-verified with a real
 * non-admin JWT too — see the phase report.
 */
describe('ProductsController.reactivate — role gate', () => {
  it('is decorated with @Roles(Role.ADMIN), same as the deactivate (remove) route', () => {
    // Reflect.getMetadata reads the decorator's metadata off the method —
    // it never invokes it, so there's no real unbound-`this` risk here;
    // this is the standard way to introspect a NestJS route decorator
    // without booting the app.
    /* eslint-disable @typescript-eslint/unbound-method */
    const reactivateRoles = Reflect.getMetadata(
      ROLES_KEY,
      ProductsController.prototype.reactivate,
    ) as Role[] | undefined;
    const removeRoles = Reflect.getMetadata(
      ROLES_KEY,
      ProductsController.prototype.remove,
    ) as Role[] | undefined;
    /* eslint-enable @typescript-eslint/unbound-method */

    expect(reactivateRoles).toEqual([Role.ADMIN]);
    expect(reactivateRoles).toEqual(removeRoles);
  });
});
