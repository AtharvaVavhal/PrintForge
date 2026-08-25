import { Controller } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';

/**
 * Owns (§19/§20): GET/PATCH /admin/orders[/:id], PATCH
 * /admin/orders/:id/status (CAS-idempotent), GET /admin/dashboard,
 * GET/admin/customers[/:id]. Admin product/category/variant CRUD is exposed
 * under /products with @Roles(Role.ADMIN), not duplicated here.
 *
 * Route guards are UX-only on the frontend — every route here independently
 * enforces the role check server-side via RolesGuard (§18).
 *
 * TODO(admin): implement.
 */
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}
}
