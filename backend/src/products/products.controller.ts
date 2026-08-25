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
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

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
    );
  }

  @Public()
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.productsService.getProductBySlug(slug);
  }

  @Roles(Role.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.productsService.deactivateProduct(id);
    return { message: 'Product deactivated' };
  }

  @Roles(Role.ADMIN)
  @Post(':id/variants')
  @HttpCode(HttpStatus.CREATED)
  async addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.createVariant(id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/variants/:variantId')
  async updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  async addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.productsService.addImage(id, dto);
  }

  @Roles(Role.ADMIN)
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
