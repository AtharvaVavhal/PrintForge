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
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PlatformOnly } from '../../common/decorators/platform-only.decorator';
import { ListPlatformDomainsQueryDto } from './dto/list-platform-domains-query.dto';
import { PlatformDomainActionDto } from './dto/platform-domain-action.dto';
import { PlatformDomainsService } from './platform-domains.service';

/**
 * Platform Control Plane — Store Domains (Phase 9 W5 + W6; spec §6.4,
 * ⚖️ P9-D5, ⚖️ P9-S7):
 *
 *   GET    /platform/domains             list/filter across every tenant
 *   GET    /platform/domains/:id         inspect + LIVE provider read
 *   POST   /platform/domains/:id/revoke  VERIFIED -> FAILED      (sticky)
 *   POST   /platform/domains/:id/override  PENDING|FAILED -> VERIFIED
 *   POST   /platform/domains/:id/verify  force re-verify (DNS)
 *   DELETE /platform/domains/:id         remove any tenant's CUSTOM domain
 *
 * Every route is `SUPER_ADMIN`-only via the class-level `@PlatformOnly()`,
 * exactly as `PlatformController` / `PlatformPlansController` /
 * `PlatformConfigController`: `PlatformGuard` reads the class metadata,
 * `TenantContextGuard` skips the controller, `PermissionsGuard` passes
 * through. A tenant `OWNER` holding `store-domain:manage` cannot reach any
 * route here — that is what makes the P9-S7 revoke sticky rather than merely
 * conventional. Listed in `common/guards/platform.guard.spec.ts`'s exact
 * enumerated set of `@PlatformOnly()` consumers.
 *
 * Every MUTATION requires a `justification` and writes `PlatformAuditLog`
 * (spec §6.4), the same discipline tenant suspend/resume already follows. The
 * two reads take no justification and write no audit row, exactly as
 * `GET /platform/tenants[/:id]` does.
 *
 * There is deliberately no platform "refresh TLS" mutation: `GET :id` already
 * performs the live provider read an operator needs, and writing another
 * tenant's `tlsStatus` from a read is not a thing this surface should do.
 */
@Controller('platform/domains')
@PlatformOnly()
export class PlatformDomainsController {
  constructor(
    private readonly platformDomainsService: PlatformDomainsService,
  ) {}

  @Get()
  async list(@Query() query: ListPlatformDomainsQueryDto) {
    return this.platformDomainsService.list(query);
  }

  @Get(':id')
  async inspect(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformDomainsService.inspect(id);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformDomainActionDto,
    @Ip() ip: string,
  ) {
    return this.platformDomainsService.revoke(actor, id, dto.justification, ip);
  }

  @Post(':id/override')
  @HttpCode(HttpStatus.OK)
  async override(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformDomainActionDto,
    @Ip() ip: string,
  ) {
    return this.platformDomainsService.override(
      actor,
      id,
      dto.justification,
      ip,
    );
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformDomainActionDto,
    @Ip() ip: string,
  ) {
    return this.platformDomainsService.reverify(
      actor,
      id,
      dto.justification,
      ip,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformDomainActionDto,
    @Ip() ip: string,
  ) {
    return this.platformDomainsService.remove(actor, id, dto.justification, ip);
  }
}
