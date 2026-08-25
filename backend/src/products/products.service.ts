import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  Prisma,
  Product,
  ProductImage,
  ProductVariant,
} from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaginatedResult } from '../common/types/api-response.interface';
import { UploadsService } from '../uploads/uploads.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';

const PRODUCT_DETAIL_INCLUDE = {
  variants: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Product & {
  variants: ProductVariant[];
  images: ProductImage[];
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ─── Categories ──────────────────────────────────────────────────────

  async listCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentCategoryId) {
      await this.getCategoryOrThrow(dto.parentCategoryId);
    }
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (err) {
      this.mapUniqueConstraintError(
        err,
        'A category with this slug already exists',
      );
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.getCategoryOrThrow(id);
    if (dto.parentCategoryId) {
      await this.getCategoryOrThrow(dto.parentCategoryId);
    }
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (err) {
      this.mapUniqueConstraintError(
        err,
        'A category with this slug already exists',
      );
    }
  }

  private async getCategoryOrThrow(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  // ─── Products (public reads) ─────────────────────────────────────────

  async listProducts(
    page: number,
    limit: number,
    categoryId: string | undefined,
  ): Promise<PaginatedResult<ProductWithRelations>> {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getProductBySlug(slug: string): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    if (!product) {
      // Deliberately identical to "doesn't exist" — an inactive product is
      // never distinguishable from a nonexistent one via this endpoint.
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  // ─── Products (admin writes) ─────────────────────────────────────────

  async createProduct(dto: CreateProductDto): Promise<ProductWithRelations> {
    await this.getCategoryOrThrow(dto.categoryId);
    try {
      const created = await this.prisma.product.create({
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          slug: dto.slug,
          basePrice: dto.basePrice,
          minQuantity: dto.minQuantity,
          maxQuantity: dto.maxQuantity,
          specifications: dto.specifications as
            Prisma.InputJsonValue | undefined,
        },
      });
      return { ...created, variants: [], images: [] };
    } catch (err) {
      this.mapUniqueConstraintError(
        err,
        'A product with this slug already exists',
      );
    }
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductWithRelations> {
    await this.getProductOrThrow(id);
    if (dto.categoryId) {
      await this.getCategoryOrThrow(dto.categoryId);
    }
    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          slug: dto.slug,
          basePrice: dto.basePrice,
          minQuantity: dto.minQuantity,
          maxQuantity: dto.maxQuantity,
          specifications: dto.specifications as
            Prisma.InputJsonValue | undefined,
        },
        include: PRODUCT_DETAIL_INCLUDE,
      });
    } catch (err) {
      this.mapUniqueConstraintError(
        err,
        'A product with this slug already exists',
      );
    }
  }

  /** Soft-delete only — isActive=false. Products are never hard-deleted (§24). */
  async deactivateProduct(id: string): Promise<void> {
    await this.getProductOrThrow(id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async getProductOrThrow(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  // ─── Variants (admin writes) ─────────────────────────────────────────

  async createVariant(
    productId: string,
    dto: CreateVariantDto,
  ): Promise<ProductVariant> {
    await this.getProductOrThrow(productId);
    try {
      return await this.prisma.productVariant.create({
        data: { productId, ...dto },
      });
    } catch (err) {
      this.mapUniqueConstraintError(
        err,
        'A variant with this label already exists for this product',
      );
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.getVariantOrThrow(productId, variantId);
    try {
      return await this.prisma.productVariant.update({
        where: { id: variant.id },
        data: dto,
      });
    } catch (err) {
      this.mapUniqueConstraintError(
        err,
        'A variant with this label already exists for this product',
      );
    }
  }

  private async getVariantOrThrow(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    await this.getProductOrThrow(productId);
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant not found for this product');
    }
    return variant;
  }

  // ─── Images (admin writes) ───────────────────────────────────────────

  async addImage(
    productId: string,
    dto: CreateProductImageDto,
  ): Promise<ProductImage> {
    await this.getProductOrThrow(productId);

    const uploadedFile = await this.uploadsService.findById(dto.uploadedFileId);
    if (!uploadedFile) {
      throw new NotFoundException('Uploaded file not found');
    }

    return this.prisma.productImage.create({
      data: {
        productId,
        cloudinaryPublicId: uploadedFile.cloudinaryPublicId,
        sortOrder: dto.sortOrder ?? 0,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async removeImage(productId: string, imageId: string): Promise<void> {
    await this.getProductOrThrow(productId);
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Image not found for this product');
    }
    await this.prisma.productImage.delete({ where: { id: imageId } });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private mapUniqueConstraintError(err: unknown, message: string): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw err as Error;
  }
}
