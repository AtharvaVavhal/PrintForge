import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PlatformOnly } from '../common/decorators/platform-only.decorator';
import { CreateSupportSessionDto } from './dto/create-support-session.dto';
import { ListSupportSessionsQueryDto } from './dto/list-support-sessions-query.dto';
import { SupportSessionService } from './support-session.service';

/**
 * Owns (SaaS Master Plan §11; Phase 5 W6): POST /platform/support-sessions,
 * POST /platform/support-sessions/:id/revoke, GET /platform/support-sessions
 * — the exact, frozen three-route set, nothing more. Every route here is
 * `SUPER_ADMIN`-only via the class-level `@PlatformOnly()` below, the same
 * single-decorator-covers-every-method mechanism `platform.controller.ts`
 * already uses (`PlatformGuard` reads this metadata via
 * `Reflector.getAllAndOverride`, handler then class).
 *
 * `@PlatformOnly()` also makes `SupportSessionContextGuard` and
 * `TenantContextGuard` both skip this whole controller — a support session
 * never grants access to these routes, and these routes never resolve or
 * need a `TenantContext` of their own (they operate on `SupportSession`/
 * `Tenant` rows by id, exactly like `PlatformController`).
 */
@Controller('platform/support-sessions')
@PlatformOnly()
export class SupportSessionController {
  constructor(private readonly supportSessionService: SupportSessionService) {}

  @Post()
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateSupportSessionDto,
    @Ip() ip: string,
  ) {
    return this.supportSessionService.createSession(actor, dto, ip);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.supportSessionService.revokeSession(actor, id, ip);
  }

  @Get()
  async list(@Query() query: ListSupportSessionsQueryDto) {
    return this.supportSessionService.listSessions(query);
  }
}
