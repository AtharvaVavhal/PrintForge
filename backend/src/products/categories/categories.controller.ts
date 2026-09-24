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
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../auth/permissions/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { StoreContextService } from '../../common/tenant/store-domain-resolution/store-context.service';
import type { StorefrontRequest } from '../../common/tenant/store-domain-resolution/store-context.service';
import { ProductsService } from '../products.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';

/**
 * Owns (§20): GET /categories (Public, flat list — one nesting level via
 * parentCategoryId, no server-built tree, §8); admin create/update (Admin).
 * GET /categories/tree (Public, nested tree via parentCategoryId).
 * Kept as a subfolder of the products aggregate (§17) but a distinct
 * top-level `/categories` path, so it needs its own @Controller.
 *
 * Phase 13.2 adds the admin management surface that the public reads
 * couldn't provide: GET /categories/admin (all categories, incl.
 * inactive), DELETE /categories/:id (deactivate) and POST
 * /categories/:id/reactivate — mirroring ProductsController's exact
 * pattern. The public GET /categories and GET /categories/tree stay
 * isActive-filtered, so an inactive category remains hidden from the
 * storefront.
 */
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storeContext: StoreContextService,
  ) {}

  // Phase 9 W4: scoped to the resolved store in `host_resolution` mode;
  // unscoped (unchanged) in `legacy_single_store` mode — see
  // `StoreContextService.resolvePublicScope`.
  @Public()
  @Get()
  async list(@Req() request: StorefrontRequest) {
    const scope = await this.storeContext.resolvePublicScope(request);
    return this.productsService.listCategories(scope);
  }

  @Public()
  @Get('tree')
  async tree(@Req() request: StorefrontRequest) {
    const scope = await this.storeContext.resolvePublicScope(request);
    return this.productsService.getCategoryTree(scope);
  }

  @RequirePermission('products:read')
  @Get('admin')
  async adminList(@CurrentTenant() tenant: TenantContext) {
    return this.productsService.adminListCategories(tenant);
  }

  @RequirePermission('products:write')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.productsService.createCategory(tenant, actor, dto);
  }

  @RequirePermission('products:write')
  @Patch(':id')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.productsService.updateCategory(tenant, actor, id, dto);
  }

  /** Soft-delete (isActive=false), mirroring DELETE /products/:id. */
  @RequirePermission('products:write')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.productsService.deactivateCategory(tenant, actor, id);
    return { message: 'Category deactivated' };
  }

  /** Mirrors POST /products/:id/reactivate. */
  @RequirePermission('products:write')
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.productsService.reactivateCategory(tenant, actor, id);
    return { message: 'Category reactivated' };
  }
}
