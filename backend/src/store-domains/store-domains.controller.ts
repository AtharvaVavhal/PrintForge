import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { RequirePermission } from '../auth/permissions/require-permission.decorator';
import { CurrentTenantContext } from '../common/decorators/current-tenant-context.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { TenantContext } from '../common/tenant/tenant-context';
import { AddStoreDomainDto } from './dto/add-store-domain.dto';
import { StoreDomainsService } from './store-domains.service';

/**
 * Tenant Control Plane — Merchant Store Domains (Phase 9 W5 + W6; spec
 * §6.1). Owns exactly six routes:
 *
 *   GET    /admin/store-domains                  list the tenant's own domains
 *   POST   /admin/store-domains                  add a CUSTOM hostname (PENDING)
 *   POST   /admin/store-domains/:id/verify       on-demand verification (P9-D7)
 *   POST   /admin/store-domains/:id/primary      make it the canonical domain
 *   POST   /admin/store-domains/:id/tls-refresh  re-read the provider's state
 *   DELETE /admin/store-domains/:id              remove a CUSTOM domain
 *
 * AUTHORIZATION (P9-S2). One class-level `@RequirePermission('store-domain
 * :manage')` — the SAME `PermissionsGuard` / `TenantContextGuard` /
 * `TenantLifecycleGuard` pipeline every other `/admin/*` route uses
 * (`payment-accounts.controller.ts`'s exact pattern), no second mechanism
 * and no role-name check anywhere in this module. `store-domain:manage` is
 * granted to `OWNER` only (`permission.ts` — excluded from
 * `ADMIN_PERMISSIONS` like `members:manage` / `payment-account:manage`), so
 * this controller is structurally OWNER-only. `settings:write` is NOT
 * reused and grants nothing here.
 *
 * The tenant is always the server-derived `TenantContext` (D6); `Origin` is
 * never an input to authorization on this controller.
 *
 * NOT here: the platform domain-management surface (`/platform/domains`,
 * `@PlatformOnly()`), and the real `VercelDomainHostingProvider` — W6 ships
 * the provider-neutral seam (spec §7.1) with a fake/unprovisioned binding,
 * because the §17.1 ops checklist items gating a real adapter are still open.
 */
@Controller('admin/store-domains')
@RequirePermission('store-domain:manage')
export class StoreDomainsController {
  constructor(private readonly storeDomainsService: StoreDomainsService) {}

  @Get()
  async list(@CurrentTenantContext() tenantContext: TenantContext) {
    return this.storeDomainsService.list(tenantContext);
  }

  @Post()
  async add(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AddStoreDomainDto,
  ) {
    return this.storeDomainsService.add(tenantContext, actor, dto);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.storeDomainsService.verify(tenantContext, actor, id);
  }

  @Post(':id/primary')
  @HttpCode(HttpStatus.OK)
  async setPrimary(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.storeDomainsService.setPrimary(tenantContext, actor, id);
  }

  @Post(':id/tls-refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTls(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.storeDomainsService.refreshTls(tenantContext, actor, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.storeDomainsService.remove(tenantContext, actor, id);
  }
}
