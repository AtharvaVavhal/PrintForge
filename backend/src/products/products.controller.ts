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
  Query,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermission } from '../auth/permissions/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../common/tenant/tenant-context';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto';
import { CreateCustomizationFieldDto } from './dto/create-customization-field.dto';
import { UpdateCustomizationFieldDto } from './dto/update-customization-field.dto';

/**
 * Owns (§20): GET /products, GET /products/:slug (Public); admin CRUD for
 * products, variants, images (Admin). Categories live in
 * categories/categories.controller.ts (a distinct top-level path).
 *
 * Public single-product lookup is by :slug, not :id, per the frozen §20
 * contract (`GET /products/:slug`) — the task brief said ":id" for this
 * route, but changing the API contract needs an ACR (§38); admin
 * create/update/delete/variants/images all address the product by :id,
 * which is what a create response and an admin UI already have on hand.
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  async list(@Query() query: ListProductsQueryDto) {
    return this.productsService.listProducts(
      query.page,
      query.limit,
      query.categoryId,
      query.search,
      query.minPrice,
      query.maxPrice,
      query.minRating,
      query.sort,
    );
  }

  // Admin catalog-management reads. Declared BEFORE `@Get(':slug')` so the
  // literal `admin` segment is matched by these, not swallowed as a slug.
  // Not isActive-filtered — a deactivated product stays visible here for
  // management and reactivation.

  @RequirePermission('products:read')
  @Get('admin')
  async adminList(@Query() query: ListAdminProductsQueryDto) {
    return this.productsService.adminListProducts(
      query.page,
      query.limit,
      query.categoryId,
      query.search,
      query.status,
    );
  }

  @RequirePermission('products:read')
  @Get('admin/:id')
  async adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.adminGetProduct(id);
  }

  @Public()
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.productsService.getProductBySlug(slug);
  }

  @RequirePermission('products:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(tenant.tenantId, dto);
  }

  @RequirePermission('products:write')
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, dto);
  }

  @RequirePermission('products:write')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.productsService.deactivateProduct(id);
    return { message: 'Product deactivated' };
  }

  /** Mirrors `remove` above exactly — same file, same pattern, right next
   * to it. A dedicated route rather than an `isActive` field on
   * UpdateProductDto, same reasoning as deactivation: exactly one path
   * flips this flag in either direction, both explicit. */
  @RequirePermission('products:write')
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.productsService.reactivateProduct(id);
    return { message: 'Product reactivated' };
  }

  @RequirePermission('products:write')
  @Post(':id/variants')
  @HttpCode(HttpStatus.CREATED)
  async addVariant(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.createVariant(tenant.tenantId, id, dto);
  }

  @RequirePermission('products:write')
  @Patch(':id/variants/:variantId')
  async updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  /**
   * Public read of a product's customization fields is not a separate
   * endpoint — it's folded into GET /products/:slug above (§20 groups
   * "customization-fields" with the admin-CRUD notes for products/variants;
   * §29 has this module shipping the GET /products/:slug contract as the
   * dynamic-form data source). Only admin create/update live here.
   */
  @RequirePermission('products:write')
  @Post(':id/customization-fields')
  @HttpCode(HttpStatus.CREATED)
  async addCustomizationField(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCustomizationFieldDto,
  ) {
    return this.productsService.createCustomizationField(
      tenant.tenantId,
      id,
      dto,
    );
  }

  @RequirePermission('products:write')
  @Patch(':id/customization-fields/:fieldId')
  async updateCustomizationField(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: UpdateCustomizationFieldDto,
  ) {
    return this.productsService.updateCustomizationField(id, fieldId, dto);
  }

  @RequirePermission('products:write')
  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  async addImage(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.productsService.addImage(tenant.tenantId, id, dto);
  }

  @RequirePermission('products:write')
  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.OK)
  async removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<{ message: string }> {
    await this.productsService.removeImage(id, imageId);
    return { message: 'Image removed' };
  }
}
