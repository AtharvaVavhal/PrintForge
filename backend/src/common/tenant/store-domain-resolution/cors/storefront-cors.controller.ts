import { Controller, Get, Query } from '@nestjs/common';
import { PlatformOnly } from '../../../decorators/platform-only.decorator';
import { CorsCheckQueryDto } from './dto/cors-check-query.dto';
import { StorefrontCorsPolicy } from './storefront-cors.policy';

/**
 * Phase 9 W7 — `GET /platform/config/cors-check` (spec §9 "Pre-flip
 * verification without opening CORS", §14.4).
 *
 * Read-only and side-effect free: it returns the FULL `host_resolution`
 * verdict for the supplied origin whatever mode is actually in force, so W8
 * step 5 can verify the allow-list against the platform origin,
 * `www.printforge.world` (⚖️ P9-D10 — Tenant #1's custom canary, only if B-3
 * ran; §16.2a), `<tenant1-slug>.stores.<platform>` and an unknown host
 * BEFORE flipping the resolver — while live CORS is still legacy-restricted
 * (S-9). It emits no CORS header of its own and changes no state.
 *
 * `@PlatformOnly()` (`SUPER_ADMIN`): the verdicts enumerate which hostnames
 * are registered and served platform-wide, which is platform metadata, not
 * something a tenant or an anonymous caller may probe. Listed in
 * `common/guards/platform.guard.spec.ts`'s enumerated consumer set.
 *
 * It lives on its own controller — rather than on W2's
 * `PlatformConfigController`, whose route prefix it shares — because the
 * policy depends on the W3 resolver module and `PlatformConfigModule` is
 * itself a dependency of that module; putting the route there would make the
 * two modules import each other.
 */
@Controller('platform/config')
@PlatformOnly()
export class StorefrontCorsController {
  constructor(private readonly policy: StorefrontCorsPolicy) {}

  @Get('cors-check')
  async corsCheck(@Query() query: CorsCheckQueryDto) {
    const decision = await this.policy.evaluateAsHostResolution(query.origin);
    return {
      origin: query.origin,
      // The verdict the predicate WOULD give in host_resolution mode — not
      // necessarily what live CORS is doing right now (S-9).
      evaluatedAs: 'host_resolution' as const,
      ...decision,
    };
  }
}
