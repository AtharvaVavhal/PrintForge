import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  CustomizationField,
  Prisma,
  Product,
  ProductImage,
  ProductVariant,
} from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaginatedResult } from '../common/types/api-response.interface';
import { UploadsService } from '../uploads/uploads.service';
import { CategoryTreeNode } from './dto/category-tree.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateCustomizationFieldDto } from './dto/create-customization-field.dto';
import { UpdateCustomizationFieldDto } from './dto/update-customization-field.dto';

const PRODUCT_DETAIL_INCLUDE = {
  variants: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  customizationFields: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProductInclude;

/** `url` is computed on every read (withImageUrl/withImageUrls below), never
 * persisted — Cloudinary URL construction needs the API secret, which must
 * never reach the browser, so the raw ProductImage row is never returned
 * as-is from any endpoint. */
type ProductImageWithUrl = ProductImage & { url: string };

type ProductWithRelations = Product & {
  variants: ProductVariant[];
  images: ProductImageWithUrl[];
  customizationFields: CustomizationField[];
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ─── Categories ──────────────────────────────────────────────────────

  async listCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
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

  // ─── Category Tree ──────────────────────────────────────────────────────

  async getCategoryTree(): Promise<CategoryTreeNode[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, parentCategoryId: true },
    });

    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    // First pass: create nodes
    for (const cat of categories) {
      map.set(cat.id, { id: cat.id, name: cat.name, slug: cat.slug, children: [] });
    }

    // Second pass: link children to parents
    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentCategoryId) {
        const parent = map.get(cat.parentCategoryId);
        if (parent) {
          parent.children.push(node);
        } else {
          // Orphaned child (parent doesn't exist) - treat as root
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    // Sort children recursively
    const sortRecursive = (nodes: CategoryTreeNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      for (const node of nodes) {
        if (node.children.length) sortRecursive(node.children);
      }
    };
    sortRecursive(roots);

    return roots;
  }

  // ─── Products (public reads) ─────────────────────────────────────────

  async listProducts(
    page: number,
    limit: number,
    categoryId: string | undefined,
    search: string | undefined,
    minPrice?: number,
    maxPrice?: number,
    minRating?: number,
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'rating_desc',
  ): Promise<PaginatedResult<ProductWithRelations>> {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? {
            basePrice: {
              ...(minPrice !== undefined ? { gte: minPrice } : {}),
              ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
            },
          }
        : {}),
      ...(minRating !== undefined
        ? { avgRating: { gte: minRating } }
        : {}),
    };

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    switch (sort) {
      case 'price_asc':
        orderBy = { basePrice: 'asc' };
        break;
      case 'price_desc':
        orderBy = { basePrice: 'desc' };
        break;
      case 'rating_desc':
        orderBy = { avgRating: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_DETAIL_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((item) => this.withImageUrls(item)),
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
    return this.withImageUrls(product);
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
      return {
        ...created,
        variants: [],
        images: [] as ProductImageWithUrl[],
        customizationFields: [],
      };
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
      const updated = await this.prisma.product.update({
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
      return this.withImageUrls(updated);
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

  /**
   * The reverse of deactivateProduct — same shape, same reasoning: kept as
   * its own dedicated method/endpoint (POST /products/:id/reactivate)
   * rather than an isActive field on the general PATCH (same reasoning the
   * backend applies to deactivation: exactly one path flips this flag in
   * either direction). Unconditional, same as deactivateProduct: no
   * current-state check, no error if the product is already active
   * (idempotent, admin-double-click-safe).
   */
  async reactivateProduct(id: string): Promise<void> {
    await this.getProductOrThrow(id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: true },
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

  // ─── Customization fields (admin writes) ─────────────────────────────
  // Public read is folded into GET /products/:slug (PRODUCT_DETAIL_INCLUDE
  // above), not a separate endpoint — §20 groups "customization-fields"
  // into the same admin-CRUD notes as variants/products, and §29 has
  // Atharva shipping the GET /products/:slug contract as the thing Harshad's
  // customization form UI consumes. Per-value validation and surcharge
  // pricing live in customizations/customization-validation.(util|service).ts,
  // for Cart (Phase 4) to call — not exposed here.

  async createCustomizationField(
    productId: string,
    dto: CreateCustomizationFieldDto,
  ): Promise<CustomizationField> {
    await this.getProductOrThrow(productId);
    return this.prisma.customizationField.create({
      data: {
        productId,
        label: dto.label,
        type: dto.type,
        isRequired: dto.isRequired,
        sortOrder: dto.sortOrder,
        helpText: dto.helpText,
        constraints: dto.constraints as Prisma.InputJsonValue | undefined,
        surchargeType: dto.surchargeType,
        surchargeAmount: dto.surchargeAmount,
      },
    });
  }

  async updateCustomizationField(
    productId: string,
    fieldId: string,
    dto: UpdateCustomizationFieldDto,
  ): Promise<CustomizationField> {
    const field = await this.getCustomizationFieldOrThrow(productId, fieldId);
    return this.prisma.customizationField.update({
      where: { id: field.id },
      data: {
        label: dto.label,
        type: dto.type,
        isRequired: dto.isRequired,
        sortOrder: dto.sortOrder,
        helpText: dto.helpText,
        constraints: dto.constraints as Prisma.InputJsonValue | undefined,
        surchargeType: dto.surchargeType,
        surchargeAmount: dto.surchargeAmount,
      },
    });
  }

  private async getCustomizationFieldOrThrow(
    productId: string,
    fieldId: string,
  ): Promise<CustomizationField> {
    await this.getProductOrThrow(productId);
    const field = await this.prisma.customizationField.findUnique({
      where: { id: fieldId },
    });
    if (!field || field.productId !== productId) {
      throw new NotFoundException(
        'Customization field not found for this product',
      );
    }
    return field;
  }

  // ─── Images (admin writes) ───────────────────────────────────────────

  async addImage(
    productId: string,
    dto: CreateProductImageDto,
  ): Promise<ProductImageWithUrl> {
    await this.getProductOrThrow(productId);

    const uploadedFile = await this.uploadsService.findById(dto.uploadedFileId);
    if (!uploadedFile) {
      throw new NotFoundException('Uploaded file not found');
    }

    // resourceType/deliveryType are denormalized from the actual upload,
    // not assumed — see the ProductImage model's own doc comment
    // (schema.prisma) for why.
    const created = await this.prisma.productImage.create({
      data: {
        productId,
        cloudinaryPublicId: uploadedFile.cloudinaryPublicId,
        resourceType: uploadedFile.resourceType,
        deliveryType: uploadedFile.deliveryType,
        sortOrder: dto.sortOrder ?? 0,
        isPrimary: dto.isPrimary ?? false,
      },
    });
    return this.withImageUrl(created);
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

  /** Computes a working delivery URL for every image on a product — see
   * ProductImageWithUrl's doc comment for why this is always computed on
   * read, never persisted. */
  private withImageUrls<T extends { images: ProductImage[] }>(
    product: T,
  ): Omit<T, 'images'> & { images: ProductImageWithUrl[] } {
    return {
      ...product,
      images: product.images.map((image) => this.withImageUrl(image)),
    };
  }

  private withImageUrl(image: ProductImage): ProductImageWithUrl {
    return {
      ...image,
      url: this.uploadsService.resolveUrl(
        image.cloudinaryPublicId,
        image.resourceType,
        image.deliveryType,
      ),
    };
  }

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
