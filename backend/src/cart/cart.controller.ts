import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { ResultWithMeta } from '../common/types/api-response.interface';
import type { RequestWithTenantContext } from '../common/tenant/tenant-context';
import { StoreContextService } from '../common/tenant/store-domain-resolution/store-context.service';
import type { StorefrontRequest } from '../common/tenant/store-domain-resolution/store-context.service';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartItemView } from './dto/cart-view.interface';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

type RequestWithHostname = RequestWithTenantContext & { hostname: string };

/**
 * Owns (§20): `GET /cart`, `POST/PATCH/DELETE /cart/items[/:id]` — Auth
 * always required (JwtAuthGuard is global; no @Public() anywhere here), no
 * guest cart. §20's row lists exactly this set — no standalone `POST /cart`
 * (create) or `DELETE /cart` (clear-all) route, so neither is implemented;
 * the cart is auto-created on first `POST /cart/items`.
 *
 * The 3 mutation endpoints return the affected item (or message) under
 * `data` as before, plus the cart's current subtotal/itemCount under the
 * envelope's `meta` (via ResultWithMeta, unwrapped by ResponseInterceptor)
 * so the frontend doesn't need a follow-up GET /cart after every mutation.
 * GET /cart's own response shape is unchanged.
 */
@Controller('cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly storeContext: StoreContextService,
  ) {}

  /**
   * A shopper (`Role.CUSTOMER`) never holds a `TenantMembership`, so
   * `TenantContextGuard` never resolves `request.tenantContext` for these
   * routes — the storefront scope comes from `StoreContextService` (Phase
   * 9 W3, spec §4.4): the W2 kill-switch selects the pre-Phase-9
   * `StorefrontTenantResolver` (`legacy_single_store`) or the `Origin`-
   * keyed `StoreDomain` pipeline (`host_resolution`). Prefers
   * `tenantContext` when present (e.g. an admin account exercising these
   * same endpoints) so the merchant path never pays for a redundant
   * lookup — unchanged since Phase 4 W7 / P4-D2.
   */
  private resolveTenantId(request: RequestWithHostname): Promise<string> {
    return this.storeContext.resolveActiveTenantId(
      request as unknown as StorefrontRequest,
    );
  }

  @Get()
  async getCart(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithHostname,
  ) {
    const tenantId = await this.resolveTenantId(request);
    return this.cartService.getCart(user.id, tenantId);
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithHostname,
    @Body() dto: AddCartItemDto,
  ): Promise<ResultWithMeta<CartItemView>> {
    const tenantId = await this.resolveTenantId(request);
    // Phase 9 W4 (R-14): only a context produced by the `host_resolution`
    // pipeline anchors the cart to the resolving store; the legacy strategy
    // and the merchant `tenantContext` shortcut leave `storeContext` unset
    // or `legacy`, so the flag is false there and behaviour is unchanged.
    const storeContext = (request as unknown as StorefrontRequest).storeContext;
    const item = await this.cartService.addItem(user.id, tenantId, dto, {
      requireCartInResolvedTenant: storeContext?.resolvedBy === 'origin',
    });
    const meta = await this.cartService.getCartTotals(user.id, tenantId);
    return { data: item, meta };
  }

  @Patch('items/:itemId')
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithHostname,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<ResultWithMeta<CartItemView>> {
    const tenantId = await this.resolveTenantId(request);
    const item = await this.cartService.updateItem(
      user.id,
      tenantId,
      itemId,
      dto,
    );
    const meta = await this.cartService.getCartTotals(user.id, tenantId);
    return { data: item, meta };
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.OK)
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithHostname,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<ResultWithMeta<{ message: string }>> {
    const tenantId = await this.resolveTenantId(request);
    await this.cartService.removeItem(user.id, tenantId, itemId);
    const meta = await this.cartService.getCartTotals(user.id, tenantId);
    return { data: { message: 'Item removed from cart' }, meta };
  }
}
