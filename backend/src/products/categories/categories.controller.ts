import {
  Body,
  Controller,
  Get,
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
 * Kept as a subfolder of the products aggregate (§17) but a distinct
 * top-level `/categories` path, so it needs its own @Controller.
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  async list() {
    return this.productsService.listCategories();
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
}
