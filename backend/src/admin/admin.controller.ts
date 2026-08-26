import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrdersService } from '../orders/orders.service';
import { AdminService } from './admin.service';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

/**
 * Owns (§19/§20): GET /admin/orders, GET /admin/orders/:id, PATCH
 * /admin/orders/:id/status (CAS-idempotent — already-applied transition
 * → 200, illegal → 409). GET /admin/dashboard, GET /admin/customers[/:id]
 * remain unimplemented (out of this phase's scope). Order CRUD delegates
 * to OrdersService — same pattern as CategoriesController sharing
 * ProductsService in Phase 2 — not duplicated into AdminService.
 *
 * Route guards are UX-only on the frontend — every route here independently
 * enforces the role check server-side via RolesGuard (§18).
 */
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get('orders')
  async listOrders(@Query() query: ListAdminOrdersQueryDto) {
    return this.ordersService.adminListOrders(query);
  }

  @Get('orders/:id')
  async orderDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.adminGetOrderDetail(id);
  }

  @Patch('orders/:id/status')
  async updateOrderStatus(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.adminTransitionStatus(admin.id, id, dto);
  }
}
