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
import { ReviewsService } from '../reviews/reviews.service';
import { UpdateReviewStatusDto } from '../reviews/dto/update-review-status.dto';
import { AdminService } from './admin.service';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { ListAdminCustomersQueryDto } from './dto/list-admin-customers-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

/**
 * Owns (§19/§20): GET /admin/orders, GET /admin/orders/:id, PATCH
 * /admin/orders/:id/status (CAS-idempotent — already-applied transition
 * → 200, illegal → 409, and a target status of REFUNDED also closes out
 * the order's PENDING Refund row — see OrdersService.performRefundRecording
 * — §13.L/§32's "record only, no in-app refund-initiation API"), GET
 * /admin/dashboard (minimal — no charts), GET /admin/customers[/:id]
 * (read-only), and — as of Phase 10's Reviews half — PATCH
 * /admin/reviews/:id/status (moderation; unlike order status there's no
 * transition graph to enforce, any ReviewStatus to any ReviewStatus is
 * valid). Order/review mutation delegates to OrdersService/ReviewsService —
 * same pattern as CategoriesController sharing ProductsService in Phase 2 —
 * not duplicated into AdminService; dashboard/customer aggregation is
 * AdminService's own logic, per the admin.module.ts dependency-graph note.
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
    private readonly reviewsService: ReviewsService,
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

  @Get('dashboard')
  async dashboard() {
    return this.adminService.getDashboard();
  }

  @Get('customers')
  async listCustomers(@Query() query: ListAdminCustomersQueryDto) {
    return this.adminService.listCustomers(query);
  }

  @Get('customers/:id')
  async customerDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getCustomerDetail(id);
  }

  @Patch('reviews/:id/status')
  async updateReviewStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewsService.adminUpdateStatus(id, dto);
  }
}
