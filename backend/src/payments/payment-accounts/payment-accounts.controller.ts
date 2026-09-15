import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenantContext } from '../../common/decorators/current-tenant-context.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { RequirePermission } from '../../auth/permissions/require-permission.decorator';
import { ConnectRazorpayAccountDto } from './dto/connect-razorpay-account.dto';
import { CreatePaymentAccountDto } from './dto/create-payment-account.dto';
import { ListPaymentAccountsQueryDto } from './dto/list-payment-accounts-query.dto';
import { PaymentAccountConnectionService } from './payment-account-connection.service';
import { PaymentAccountsService } from './payment-accounts.service';

/**
 * Tenant Control Plane — Merchant Payment Accounts (P8-4). Owns:
 * GET /admin/payment-accounts, GET /admin/payment-accounts/:id,
 * POST /admin/payment-accounts, POST /admin/payment-accounts/:id/activate,
 * POST /admin/payment-accounts/:id/disable. Every route here requires
 * `payment-account:manage` via the class-level `@RequirePermission(...)`
 * below — the SAME `PermissionsGuard`/`TenantContextGuard`/
 * `TenantLifecycleGuard` pipeline every other `/admin/*` route already
 * uses (`team.controller.ts`'s exact pattern), no second authorization
 * mechanism. G-13 grants `payment-account:manage` to `OWNER` only
 * (unmodified, reserved since Phase 3, unused until now), so this is
 * structurally OWNER-only already, with zero role-name checks here.
 *
 * P8-4 scope: no Razorpay OAuth, no webhook route, no payment/refund route
 * — all still deferred to later P8 stages (see `PaymentAccountsService`'s
 * own doc comment). P8-5 adds exactly one more route here — POST :id/
 * connect — delegating to `PaymentAccountConnectionService`, so this
 * controller itself still contains no Razorpay-specific logic (the
 * connect DTO's field names are the only Razorpay-flavored thing here,
 * unavoidable at this single-provider stage).
 */
@Controller('admin/payment-accounts')
@RequirePermission('payment-account:manage')
export class PaymentAccountsController {
  constructor(
    private readonly paymentAccountsService: PaymentAccountsService,
    private readonly paymentAccountConnectionService: PaymentAccountConnectionService,
  ) {}

  @Get()
  async list(
    @CurrentTenantContext() tenantContext: TenantContext,
    @Query() query: ListPaymentAccountsQueryDto,
  ) {
    return this.paymentAccountsService.list(tenantContext.tenantId, query);
  }

  @Get(':id')
  async getOne(
    @CurrentTenantContext() tenantContext: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentAccountsService.getOne(tenantContext.tenantId, id);
  }

  @Post()
  async create(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreatePaymentAccountDto,
  ) {
    return this.paymentAccountsService.create(tenantContext, actor, dto);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentAccountsService.activate(tenantContext, actor, id);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentAccountsService.disable(tenantContext, actor, id);
  }

  // ─── POST /admin/payment-accounts/:id/connect (P8-5) ───────────────────
  //
  // One cohesive operation: submit/update Razorpay credentials AND
  // test/verify the connection. Never returns key_secret, decrypted
  // credentials, or the encrypted blob — the response is the same safe
  // `PaymentAccountView` every other route on this controller returns.

  @Post(':id/connect')
  @HttpCode(HttpStatus.OK)
  async connect(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConnectRazorpayAccountDto,
  ) {
    return this.paymentAccountConnectionService.connect(
      tenantContext,
      actor,
      id,
      dto,
    );
  }
}
