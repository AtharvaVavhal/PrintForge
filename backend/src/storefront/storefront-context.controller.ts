import { Controller, Get, Req } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { StoreContextService } from '../common/tenant/store-domain-resolution/store-context.service';
import type { StorefrontRequest } from '../common/tenant/store-domain-resolution/store-context.service';
import { StorefrontContextService } from './storefront-context.service';

/**
 * Phase 9 W4 — `GET /storefront/context` (spec §2 W4 exit gate, §4.1 /
 * §10.4, Master Plan §15 "Store-context bootstrap endpoint"). `@Public()`:
 * the SPA calls it once at boot, before any login, to learn which store
 * it is rendering. The store is resolved exactly like every other
 * storefront read (`StoreContextService`, §4.3) — the response is the
 * bootstrap shape only, never the internal `StoreContext` (no tenant id,
 * no domain row id).
 *
 * On a non-primary served host this returns 200 with `canonicalOrigin`
 * set to the primary origin so the SPA can canonicalise itself (§11,
 * S-10); the API never redirects. Phase 12 extends the payload (branding,
 * theme tokens, legal pages); W4 ships the foundation fields only.
 */
@Controller('storefront')
export class StorefrontContextController {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly storefrontContext: StorefrontContextService,
  ) {}

  @Public()
  @Get('context')
  async getContext(@Req() request: StorefrontRequest) {
    const context = await this.storeContext.resolve(request);
    return this.storefrontContext.toBootstrapView(context);
  }
}
