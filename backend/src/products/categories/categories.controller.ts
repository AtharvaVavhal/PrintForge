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
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
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
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  async list() {
    return this.productsService.listCategories();
  }

  @Public()
  @Get('tree')
  async tree() {
    return this.productsService.getCategoryTree();
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  async adminList() {
    return this.productsService.adminListCategories();
  }

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    return this.productsService.createCategory(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.productsService.updateCategory(id, dto);
  }

  /** Soft-delete (isActive=false), mirroring DELETE /products/:id. */
  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.productsService.deactivateCategory(id);
    return { message: 'Category deactivated' };
  }

  /** Mirrors POST /products/:id/reactivate. */
  @Roles(Role.ADMIN)
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.productsService.reactivateCategory(id);
    return { message: 'Category reactivated' };
  }
}
