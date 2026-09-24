import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PlatformOnly } from '../../common/decorators/platform-only.decorator';
import { SetStorefrontResolutionModeDto } from './dto/set-storefront-resolution-mode.dto';
import { StorefrontResolutionModeService } from './storefront-resolution-mode.service';

/**
 * Phase 9 W2 — `platform/config` routes (spec §15 "Who may flip" / "Read
 * visibility"). Every route is `SUPER_ADMIN`-only via the class-level
 * `@PlatformOnly()`, exactly as `PlatformController` and
 * `PlatformPlansController`: `PlatformGuard` reads the class metadata,
 * `TenantContextGuard` skips the controller, `PermissionsGuard` passes
 * through. This is the Platform Control Plane; no tenant user can reach
 * it. Listed in `common/guards/platform.guard.spec.ts`'s exact enumerated
 * set of `@PlatformOnly()` consumers.
 *
 *   GET /platform/config/storefront-domain-resolution
 *     → { mode, source } — the EFFECTIVE mode this process would apply
 *       (source `row` | `default` | `last_known_valid`); 503 in the
 *       P9-S14 fail-closed state with no last-known valid mode.
 *   PUT /platform/config/storefront-domain-resolution
 *     → flips the kill-switch (audited, justification required, cache
 *       busted) — runtime, no redeploy (P9-D8).
 */
@Controller('platform/config')
@PlatformOnly()
export class PlatformConfigController {
  constructor(
    private readonly resolutionMode: StorefrontResolutionModeService,
  ) {}

  @Get('storefront-domain-resolution')
  async getStorefrontDomainResolution() {
    return this.resolutionMode.getMode();
  }

  @Put('storefront-domain-resolution')
  @HttpCode(HttpStatus.OK)
  async setStorefrontDomainResolution(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SetStorefrontResolutionModeDto,
    @Ip() ip: string,
  ) {
    return this.resolutionMode.setMode(actor, dto.mode, dto.justification, ip);
  }
}
