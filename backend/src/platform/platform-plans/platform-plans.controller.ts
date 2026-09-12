import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PlatformOnly } from '../../common/decorators/platform-only.decorator';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { SetPlanFeatureDto } from './dto/set-plan-feature.dto';
import { SetPlanLimitDto } from './dto/set-plan-limit.dto';
import { CreateEntitlementOverrideDto } from './dto/create-entitlement-override.dto';
import { PlatformPlansService } from './platform-plans.service';

/**
 * Phase 6 (W1) — Platform Control Plane catalogue CRUD: Plans,
 * PlanFeature/PlanLimit, TenantEntitlementOverride. Sits alongside
 * `PlatformController` under the same `/platform` prefix (no route
 * collides — see `platform-plans.module.ts`), same `@PlatformOnly()`
 * class-level guarding convention (`PlatformGuard` reads the metadata at
 * the class OR method level via `Reflector.getAllAndOverride`, so a
 * second controller under the same prefix is just as fully covered as the
 * first).
 *
 * Deliberately does NOT expose `/platform/tenants/:id/entitlements` or
 * `/platform/tenants/:id/usage` — those are Phase 6 W2 (`EntitlementService`
 * reads), out of scope here. This controller never reads or writes
 * `Subscription.planId`/`Subscription.status` (Phase 7's exclusive write
 * surface).
 */
@Controller('platform')
@PlatformOnly()
export class PlatformPlansController {
  constructor(private readonly plansService: PlatformPlansService) {}

  // ─── Plans ──────────────────────────────────────────────────────────────

  @Get('plans')
  async listPlans() {
    return this.plansService.listPlans();
  }

  /** Phase 6 W7 — "inspect plan" (§5). Placed before `PATCH plans/:id`
   * purely for reading order; NestJS route matching is by path shape, not
   * declaration order, so this introduces no ambiguity with any other
   * `plans/:id...` route below. */
  @Get('plans/:id')
  async getPlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.plansService.getPlan(id);
  }

  @Post('plans')
  async createPlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreatePlanDto,
    @Ip() ip: string,
  ) {
    return this.plansService.createPlan(actor, dto, ip);
  }

  @Patch('plans/:id')
  async updatePlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @Ip() ip: string,
  ) {
    return this.plansService.updatePlan(actor, id, dto, ip);
  }

  @Post('plans/:id/archive')
  @HttpCode(HttpStatus.OK)
  async archivePlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.plansService.archivePlan(actor, id, ip);
  }

  @Post('plans/:id/restore')
  @HttpCode(HttpStatus.OK)
  async restorePlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.plansService.restorePlan(actor, id, ip);
  }

  /** A genuine hard delete (never a soft isActive=false — that's
   * `archivePlan` above), gated on zero subscriptions ever referencing the
   * plan. Returns `{message}` with 200, same convention every other
   * `DELETE` route in this codebase already uses (`ProductsController
   * .remove`, `CategoriesController.deactivate`), rather than a bare 204. */
  @Delete('plans/:id')
  @HttpCode(HttpStatus.OK)
  async deletePlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    await this.plansService.deletePlan(actor, id, ip);
    return { message: 'Plan deleted' };
  }

  // ─── Feature / limit catalogue ──────────────────────────────────────────

  @Get('features')
  getFeatureCatalogue() {
    return this.plansService.getFeatureCatalogue();
  }

  @Get('limits')
  getLimitCatalogue() {
    return this.plansService.getLimitCatalogue();
  }

  @Get('plans/:id/features')
  async listPlanFeatures(@Param('id', ParseUUIDPipe) id: string) {
    return this.plansService.listPlanFeatures(id);
  }

  @Patch('plans/:id/features/:featureKey')
  async setPlanFeature(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('featureKey') featureKey: string,
    @Body() dto: SetPlanFeatureDto,
    @Ip() ip: string,
  ) {
    return this.plansService.setPlanFeature(actor, id, featureKey, dto, ip);
  }

  @Get('plans/:id/limits')
  async listPlanLimits(@Param('id', ParseUUIDPipe) id: string) {
    return this.plansService.listPlanLimits(id);
  }

  @Patch('plans/:id/limits/:limitKey')
  async setPlanLimit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('limitKey') limitKey: string,
    @Body() dto: SetPlanLimitDto,
    @Ip() ip: string,
  ) {
    return this.plansService.setPlanLimit(actor, id, limitKey, dto, ip);
  }

  // ─── Tenant entitlement overrides ───────────────────────────────────────

  @Get('tenants/:tenantId/overrides')
  async listOverrides(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.plansService.listOverridesForTenant(tenantId);
  }

  @Post('tenants/:tenantId/overrides')
  async createOverride(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateEntitlementOverrideDto,
    @Ip() ip: string,
  ) {
    return this.plansService.createOverride(actor, tenantId, dto, ip);
  }

  @Post('tenants/:tenantId/overrides/:overrideId/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeOverride(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
    @Ip() ip: string,
  ) {
    return this.plansService.revokeOverride(actor, tenantId, overrideId, ip);
  }
}
