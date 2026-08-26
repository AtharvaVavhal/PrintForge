import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cart, Prisma, Product, ProductVariant } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { CustomizationValidationService } from '../products/customizations/customization-validation.service';
import { validateCustomizationFieldShape } from '../products/customizations/customization-validation.util';
import { PLATFORM_DEFAULT_MAX_QUANTITY } from './cart.constants';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CustomizationValueDto } from './dto/customization-value.dto';
import {
  CartItemView,
  CartView,
  UnavailableReason,
} from './dto/cart-view.interface';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { decimalToPaise, paiseToDecimalString } from './pricing/money.util';

const CART_ITEM_RELATIONS_INCLUDE = {
  product: true,
  variant: true,
  customizations: { include: { customizationField: true } },
} satisfies Prisma.CartItemInclude;

type CartItemWithRelations = Prisma.CartItemGetPayload<{
  include: typeof CART_ITEM_RELATIONS_INCLUDE;
}>;

const CART_DETAIL_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: CART_ITEM_RELATIONS_INCLUDE,
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{
  include: typeof CART_DETAIL_INCLUDE;
}>;

interface ItemPricing {
  unitPricePaise: bigint;
  lineTotalPaise: bigint;
  isAvailable: boolean;
  unavailableReason: UnavailableReason | null;
  customizations: {
    fieldId: string;
    label: string;
    textValue: string | null;
    uploadedFileId: string | null;
    surchargePaise: bigint;
  }[];
}

/**
 * §10/§11: one cart per user, auto-created on first add, no guest cart.
 * Nothing is snapshotted here — price is recomputed live from current
 * Product/ProductVariant/CustomizationField state on every read/mutation,
 * so an admin editing basePrice/priceDelta/surchargeAmount after an item
 * was added is reflected immediately (snapshotting happens at order-
 * creation time, Phase 5+, not here).
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customizationValidation: CustomizationValidationService,
  ) {}

  async getCart(userId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    const full = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: CART_DETAIL_INCLUDE,
    });
    return this.toCartView(full);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartItemView> {
    const cart = await this.getOrCreateCart(userId);
    const product = await this.getActiveProductOrThrow(dto.productId);
    const variant = await this.getActiveVariantOrThrow(product, dto.variantId);

    this.assertQuantityInBounds(product, dto.quantity);
    await this.validateCustomizationsForWrite(
      product.id,
      dto.customizations ?? [],
      userId,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id,
          quantity: dto.quantity,
        },
      });
      if (dto.customizations?.length) {
        await tx.cartItemCustomization.createMany({
          data: dto.customizations.map((c) => ({
            cartItemId: item.id,
            customizationFieldId: c.fieldId,
            textValue: c.textValue,
            uploadedFileId: c.uploadedFileId,
          })),
        });
      }
      return tx.cartItem.findUniqueOrThrow({
        where: { id: item.id },
        include: CART_ITEM_RELATIONS_INCLUDE,
      });
    });

    return this.toItemView(created);
  }

  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartItemView> {
    const existing = await this.getOwnedItemOrThrow(userId, itemId);

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: existing.productId },
    });
    if (!product.isActive) {
      throw new ConflictException(
        'This product is no longer available — remove it from your cart',
      );
    }
    if (existing.variantId) {
      const variant = await this.prisma.productVariant.findUniqueOrThrow({
        where: { id: existing.variantId },
      });
      if (!variant.isAvailable) {
        throw new ConflictException(
          'This variant is no longer available — remove it from your cart',
        );
      }
    }

    this.assertQuantityInBounds(product, dto.quantity);

    const updated = await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
      include: CART_ITEM_RELATIONS_INCLUDE,
    });
    return this.toItemView(updated);
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    await this.getOwnedItemOrThrow(userId, itemId);

    // customization rows RESTRICT-reference the item (§15) — delete them first.
    await this.prisma.$transaction([
      this.prisma.cartItemCustomization.deleteMany({
        where: { cartItemId: itemId },
      }),
      this.prisma.cartItem.delete({ where: { id: itemId } }),
    ]);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private async getOrCreateCart(userId: string): Promise<Cart> {
    return this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private async getOwnedItemOrThrow(
    userId: string,
    itemId: string,
  ): Promise<{
    id: string;
    cartId: string;
    productId: string;
    variantId: string | null;
  }> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.cartId !== cart.id) {
      throw new NotFoundException('Cart item not found');
    }
    return item;
  }

  private async getActiveProductOrThrow(productId: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (!product.isActive) {
      // 409, not 404: the product exists but adding it is refused because
      // of its current state — matches the CustomizationField "field
      // exists but the submitted value against it is rejected" pattern.
      throw new ConflictException('This product is no longer available');
    }
    return product;
  }

  private async getActiveVariantOrThrow(
    product: Product,
    variantId: string | undefined,
  ): Promise<ProductVariant | null> {
    if (!variantId) {
      return null;
    }
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.productId !== product.id) {
      throw new NotFoundException('Variant not found for this product');
    }
    if (!variant.isAvailable) {
      throw new ConflictException('This variant is no longer available');
    }
    return variant;
  }

  private assertQuantityInBounds(product: Product, quantity: number): void {
    const max = product.maxQuantity ?? PLATFORM_DEFAULT_MAX_QUANTITY;
    if (quantity < product.minQuantity || quantity > max) {
      throw new BadRequestException(
        `Quantity must be between ${product.minQuantity} and ${max} for this product`,
      );
    }
  }

  /**
   * Re-validates every field on the product (catches missing-required
   * fields) and every submitted fieldId (catches typos/foreign fields) via
   * CustomizationValidationService — the Phase 3 service, not reimplemented
   * here. Throws 400 with the service's own message on the first failure.
   */
  private async validateCustomizationsForWrite(
    productId: string,
    submissions: CustomizationValueDto[],
    userId: string,
  ): Promise<void> {
    const fields = await this.prisma.customizationField.findMany({
      where: { productId },
    });
    const fieldIds = new Set(fields.map((f) => f.id));

    for (const submission of submissions) {
      if (!fieldIds.has(submission.fieldId)) {
        throw new BadRequestException(
          `Unknown customization field for this product: ${submission.fieldId}`,
        );
      }
    }

    for (const field of fields) {
      const submission = submissions.find((s) => s.fieldId === field.id);
      const result = await this.customizationValidation.validate(
        field,
        {
          textValue: submission?.textValue,
          uploadedFileId: submission?.uploadedFileId,
        },
        userId,
      );
      if (!result.valid) {
        throw new BadRequestException(result.error);
      }
    }
  }

  // ─── Pricing / view assembly (§11 canonical algorithm, in paise) ──────

  private computeItemPricing(item: CartItemWithRelations): ItemPricing {
    const basePaise = decimalToPaise(item.product.basePrice);
    const deltaPaise = item.variant
      ? decimalToPaise(item.variant.priceDelta)
      : 0n;

    let surchargeTotalPaise = 0n;
    const customizations = item.customizations.map((c) => {
      const result = validateCustomizationFieldShape(c.customizationField, {
        textValue: c.textValue ?? undefined,
        uploadedFileId: c.uploadedFileId ?? undefined,
      });
      surchargeTotalPaise += result.surchargePaise;
      return {
        fieldId: c.customizationFieldId,
        label: c.customizationField.label,
        textValue: c.textValue,
        uploadedFileId: c.uploadedFileId,
        surchargePaise: result.surchargePaise,
      };
    });

    // unitPrice embeds the surcharge once; never re-added at line/cart level (§11).
    const unitPricePaise = basePaise + deltaPaise + surchargeTotalPaise;
    const lineTotalPaise = unitPricePaise * BigInt(item.quantity);

    const isProductInactive = !item.product.isActive;
    const isVariantUnavailable = item.variant
      ? !item.variant.isAvailable
      : false;

    return {
      unitPricePaise,
      lineTotalPaise,
      isAvailable: !isProductInactive && !isVariantUnavailable,
      unavailableReason: isProductInactive
        ? 'PRODUCT_INACTIVE'
        : isVariantUnavailable
          ? 'VARIANT_UNAVAILABLE'
          : null,
      customizations,
    };
  }

  private toItemView(item: CartItemWithRelations): CartItemView {
    return this.buildItemView(item, this.computeItemPricing(item));
  }

  private buildItemView(
    item: CartItemWithRelations,
    pricing: ItemPricing,
  ): CartItemView {
    return {
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      variantId: item.variantId,
      variantLabel: item.variant?.label ?? null,
      quantity: item.quantity,
      unitPrice: paiseToDecimalString(pricing.unitPricePaise),
      lineTotal: paiseToDecimalString(pricing.lineTotalPaise),
      isAvailable: pricing.isAvailable,
      unavailableReason: pricing.unavailableReason,
      customizations: pricing.customizations.map((c) => ({
        fieldId: c.fieldId,
        label: c.label,
        textValue: c.textValue,
        uploadedFileId: c.uploadedFileId,
        surcharge: paiseToDecimalString(c.surchargePaise),
      })),
    };
  }

  private toCartView(cart: CartWithItems): CartView {
    const priced = cart.items.map((item) => ({
      item,
      pricing: this.computeItemPricing(item),
    }));
    const items = priced.map(({ item, pricing }) =>
      this.buildItemView(item, pricing),
    );
    const subtotalPaise = priced.reduce(
      (sum, { pricing }) => sum + pricing.lineTotalPaise,
      0n,
    );
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      id: cart.id,
      items,
      itemCount,
      subtotal: paiseToDecimalString(subtotalPaise),
    };
  }
}
