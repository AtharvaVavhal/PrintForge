import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../common/tenant/tenant-context';
import { RequirePermission } from '../auth/permissions/require-permission.decorator';
import { OrdersService } from '../orders/orders.service';
import { ReviewsService } from '../reviews/reviews.service';
import { UpdateReviewStatusDto } from '../reviews/dto/update-review-status.dto';
import { CouponsService } from '../coupons/coupons.service';
import { CreateCouponDto } from '../coupons/dto/create-coupon.dto';
import { UpdateCouponDto } from '../coupons/dto/update-coupon.dto';
import { ListAdminCouponsQueryDto } from '../coupons/dto/list-admin-coupons-query.dto';
import { AppSettingService } from '../app-setting/app-setting.service';
import { UpdateSettingDto } from '../app-setting/dto/update-setting.dto';
import { InvoicesService } from '../invoices/invoices.service';
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
 * (read-only), PATCH /admin/reviews/:id/status (moderation; unlike order
 * status there's no transition graph to enforce, any ReviewStatus to any
 * ReviewStatus is valid), and — as of Phase 10's Coupons half — GET/POST
 * /admin/coupons[/:id] and PATCH /admin/coupons/:id (full CRUD; `code`/
 * `type` are immutable after creation, enforced by UpdateCouponDto's
 * whitelist, not by anything in this controller). Order/review/coupon
 * mutation delegates to OrdersService/ReviewsService/CouponsService —
 * same pattern as CategoriesController sharing ProductsService in Phase 2 —
 * not duplicated into AdminService; dashboard/customer aggregation is
 * AdminService's own logic, per the admin.module.ts dependency-graph note.
 *
 * Route guards are UX-only on the frontend — every route here independently
 * enforces its own permission check server-side via `PermissionsGuard`
 * (Phase 3; decisions P2-D9, G-13, G-20, docs/saas/DECISIONS.md). Prior to
 * Phase 3 this whole controller carried one controller-level
 * `@Roles(Role.ADMIN)`; the ratified permission catalogue (G-13)
 * distinguishes actions this controller previously treated identically
 * (e.g. viewing the dashboard vs. writing a coupon), so the single
 * decorator is replaced by one `@RequirePermission(...)` per route below —
 * an intentional, ratified granularity increase, not a functional change
 * to what an `OWNER`/`ADMIN` membership can already do.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly ordersService: OrdersService,
    private readonly reviewsService: ReviewsService,
    private readonly couponsService: CouponsService,
    private readonly appSettingService: AppSettingService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @RequirePermission('orders:read')
  @Get('orders')
  async listOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListAdminOrdersQueryDto,
  ) {
    return this.ordersService.adminListOrders(tenant, query);
  }

  @RequirePermission('orders:read')
  @Get('orders/:id')
  async orderDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.adminGetOrderDetail(tenant, id);
  }

  /** Admin view of any order's invoice (idempotent lazy creation for a
   * paid order). Phase 13.4. */
  @RequirePermission('orders:read')
  @Get('orders/:id/invoice')
  async orderInvoice(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.getInvoiceForOrder(id, {
      userId: admin.id,
      isAdmin: true,
      tenantId: tenant.tenantId,
    });
  }

  @RequirePermission('orders:transition')
  @Patch('orders/:id/status')
  async updateOrderStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.adminTransitionStatus(tenant, admin, id, dto);
  }

  @RequirePermission('dashboard:read')
  @Get('dashboard')
  async dashboard(@CurrentTenant() tenant: TenantContext) {
    return this.adminService.getDashboard(tenant);
  }

  @RequirePermission('customers:read')
  @Get('customers')
  async listCustomers(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListAdminCustomersQueryDto,
  ) {
    return this.adminService.listCustomers(tenant, query);
  }

  @RequirePermission('customers:read')
  @Get('customers/:id')
  async customerDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.getCustomerDetail(tenant, id);
  }

  @RequirePermission('reviews:moderate')
  @Patch('reviews/:id/status')
  async updateReviewStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewsService.adminUpdateStatus(tenant, admin, id, dto);
  }

  @RequirePermission('coupons:read')
  @Get('coupons')
  async listCoupons(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListAdminCouponsQueryDto,
  ) {
    return this.couponsService.listCoupons(tenant, query);
  }

  @RequirePermission('coupons:read')
  @Get('coupons/:id')
  async couponDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.couponsService.getCoupon(tenant, id);
  }

  @RequirePermission('coupons:write')
  @Post('coupons')
  async createCoupon(
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateCouponDto,
  ) {
    return this.couponsService.createCoupon(tenant, admin, dto);
  }

  @RequirePermission('coupons:write')
  @Patch('coupons/:id')
  async updateCoupon(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.couponsService.updateCoupon(tenant, admin, id, dto);
  }

  // ─── Configurable app settings ───────────────────────────────────────
  //
  // Allowlisted + validated in AppSettingService — this controller never
  // writes an arbitrary key. Setting keys are not UUIDs, so no
  // ParseUUIDPipe here; the service rejects any key outside its
  // definition list with a 400.

  @RequirePermission('settings:read')
  @Get('settings')
  async listSettings(@CurrentTenant() tenant: TenantContext) {
    return this.appSettingService.listConfigurable(tenant);
  }

  @RequirePermission('settings:write')
  @Patch('settings/:key')
  async updateSetting(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() admin: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
  ) {
    return this.appSettingService.updateConfigurable(
      tenant,
      admin,
      key,
      dto.value,
    );
  }
}
