import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import {
  decimalToPaise,
  paiseToDecimalString,
} from '../cart/pricing/money.util';
import { validateCustomizationFieldShape } from '../products/customizations/customization-validation.util';
import { OrdersService } from '../orders/orders.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { OrderLinePricing, PricingService } from './pricing/pricing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderView } from './dto/order-view.interface';

const CHECKOUT_ENDPOINT_ID = 'POST /checkout/orders';
const SHIPPING_FEE_SETTING_KEY = 'shippingFeeFlat';

/**
 * Mirrors cart's PLATFORM_DEFAULT_MAX_QUANTITY (§11) — duplicated locally
 * rather than imported from cart/, since only money.util.ts is sanctioned
 * for cross-import from the cart module in this phase.
 */
const PLATFORM_DEFAULT_MAX_QUANTITY = 1000;

const CHECKOUT_CART_ITEM_INCLUDE = {
  product: true,
  variant: true,
  customizations: { include: { customizationField: true } },
} satisfies Prisma.CartItemInclude;

type CheckoutCartItem = Prisma.CartItemGetPayload<{
  include: typeof CHECKOUT_CART_ITEM_INCLUDE;
}>;

const ORDER_DETAIL_INCLUDE = {
  items: {
    include: { customizations: true },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{
  include: typeof ORDER_DETAIL_INCLUDE;
}>;

/**
 * §17: checkout owns order creation; orders owns the post-creation state
 * machine/history (see completion report for the full reasoning). One
 * Prisma transaction covers the idempotency claim, cart re-validation,
 * pricing, Order/OrderItem/OrderItemCustomization/OrderStatusHistory
 * writes, and cart clearing — §13.G "must not partially commit".
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly idempotencyService: IdempotencyService,
    private readonly pricingService: PricingService,
  ) {}

  async checkout(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<{ view: OrderView; created: boolean }> {
    // Fast path: a repeat request for an already-completed checkout skips
    // the transaction entirely.
    const existing = await this.idempotencyService.findExisting(idempotencyKey);
    if (existing) {
      if (existing.userId !== userId) {
        // Never confirm/deny another user's key or leak their order.
        throw new ConflictException('Idempotency key already in use');
      }
      if (existing.resultOrderId) {
        return {
          view: await this.loadOrderView(existing.resultOrderId, userId),
          created: false,
        };
      }
      throw new ConflictException(
        'A checkout for this idempotency key is already in progress',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // §13.G: "SELECT cart FOR UPDATE" is the transaction's first step —
      // this is what actually makes #14 (two simultaneous checkout tabs on
      // the same cart, *different* Idempotency-Keys) race-safe. The
      // idempotency claim below only dedupes two requests sharing the same
      // key; without this lock, two concurrent transactions with different
      // keys would both read the same cart items before either deleted
      // them and both create an order. Locking first (rather than after
      // the claim) also means a same-key retry that loses this lock race
      // resumes only after the winner has committed its claim, so the
      // raced-claim lookup below reliably sees the winner's resultOrderId.
      const [lockedCart] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM carts WHERE "userId" = ${userId} FOR UPDATE
      `;

      const claim = await this.idempotencyService.claim(tx, {
        key: idempotencyKey,
        userId,
        endpoint: CHECKOUT_ENDPOINT_ID,
      });
      if (!claim) {
        // Lost the race: by the time INSERT...ON CONFLICT returns nothing,
        // Postgres has already blocked-then-unblocked us behind the
        // winning transaction's commit, so its resultOrderId is visible.
        const raced = await tx.idempotencyKey.findUnique({
          where: { key: idempotencyKey },
        });
        if (raced?.resultOrderId && raced.userId === userId) {
          return { orderId: raced.resultOrderId, created: false };
        }
        throw new ConflictException(
          'A checkout for this idempotency key is already in progress',
        );
      }

      if (!lockedCart) {
        throw new BadRequestException('Your cart is empty');
      }

      const cart = await tx.cart.findUnique({
        where: { id: lockedCart.id },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
            include: CHECKOUT_CART_ITEM_INCLUDE,
          },
        },
      });
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Your cart is empty');
      }

      this.assertItemsCheckoutable(cart.items);

      const shippingFeePaise = await this.getShippingFeePaise(tx);
      const linePricing = cart.items.map((item) => ({
        item,
        pricing: this.priceItem(item),
      }));
      const subtotalPaise = this.pricingService.sumLineTotals(
        linePricing.map((l) => l.pricing),
      );
      const totalPaise = this.pricingService.computeOrderTotal({
        subtotalPaise,
        shippingFeePaise,
      });

      const orderNumber = await this.ordersService.generateOrderNumber(tx);

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: OrderStatus.PENDING_PAYMENT,
          subtotal: paiseToDecimalString(subtotalPaise),
          total: paiseToDecimalString(totalPaise),
          shippingRecipientName: dto.shippingRecipientName,
          shippingPhone: dto.shippingPhone,
          shippingAddressLine1: dto.shippingAddressLine1,
          shippingAddressLine2: dto.shippingAddressLine2,
          shippingCity: dto.shippingCity,
          shippingState: dto.shippingState,
          shippingPostalCode: dto.shippingPostalCode,
          shippingCountry: dto.shippingCountry,
        },
      });

      for (const { item, pricing } of linePricing) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: item.productId,
            productNameSnapshot: item.product.name,
            variantLabelSnapshot: item.variant?.label ?? null,
            unitPriceSnapshot: paiseToDecimalString(pricing.unitPricePaise),
            quantity: item.quantity,
            lineTotal: paiseToDecimalString(pricing.lineTotalPaise),
          },
        });
        if (item.customizations.length > 0) {
          await tx.orderItemCustomization.createMany({
            data: item.customizations.map((c) => ({
              orderItemId: orderItem.id,
              fieldLabelSnapshot: c.customizationField.label,
              textValue: c.textValue,
              uploadedFileId: c.uploadedFileId,
            })),
          });
        }
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: createdOrder.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING_PAYMENT,
          changedByUserId: userId,
          note: 'Order created from cart at checkout',
        },
      });

      await this.idempotencyService.recordResult(tx, claim.id, createdOrder.id);

      const itemIds = cart.items.map((i) => i.id);
      // customization rows RESTRICT-reference the item (§15) — delete first.
      await tx.cartItemCustomization.deleteMany({
        where: { cartItemId: { in: itemIds } },
      });
      await tx.cartItem.deleteMany({ where: { id: { in: itemIds } } });

      return { orderId: createdOrder.id, created: true };
    });

    return {
      view: await this.loadOrderView(result.orderId, userId),
      created: result.created,
    };
  }

  /**
   * §11 "A product/variant deactivated between cart-view and checkout-
   * submit is caught inside the checkout transaction" — one of §27's
   * must-pass tests. Also re-checks quantity bounds and re-runs the same
   * (pure, Phase 3) shape/surcharge validation per customization, in case
   * an admin edited a field's constraints after the item was added.
   */
  private assertItemsCheckoutable(items: readonly CheckoutCartItem[]): void {
    for (const item of items) {
      if (!item.product.isActive) {
        throw new ConflictException(
          `"${item.product.name}" is no longer available — remove it from your cart before checking out`,
        );
      }
      if (item.variant && !item.variant.isAvailable) {
        throw new ConflictException(
          `The selected option for "${item.product.name}" is no longer available — remove it from your cart before checking out`,
        );
      }
      const max = item.product.maxQuantity ?? PLATFORM_DEFAULT_MAX_QUANTITY;
      if (item.quantity < item.product.minQuantity || item.quantity > max) {
        throw new BadRequestException(
          `Quantity for "${item.product.name}" is no longer valid (must be between ${item.product.minQuantity} and ${max})`,
        );
      }
      for (const c of item.customizations) {
        const result = validateCustomizationFieldShape(c.customizationField, {
          textValue: c.textValue ?? undefined,
          uploadedFileId: c.uploadedFileId ?? undefined,
        });
        if (!result.valid) {
          throw new BadRequestException(result.error);
        }
      }
    }
  }

  private async getShippingFeePaise(
    tx: Prisma.TransactionClient,
  ): Promise<bigint> {
    const setting = await tx.appSetting.findUnique({
      where: { key: SHIPPING_FEE_SETTING_KEY },
    });
    return setting ? decimalToPaise(new Prisma.Decimal(setting.value)) : 0n;
  }

  /** Same §11 canonical per-line formula as cart, computed via PricingService. */
  private priceItem(item: CheckoutCartItem): OrderLinePricing {
    const basePricePaise = decimalToPaise(item.product.basePrice);
    const variantDeltaPaise = item.variant
      ? decimalToPaise(item.variant.priceDelta)
      : 0n;
    let surchargePaise = 0n;
    for (const c of item.customizations) {
      const result = validateCustomizationFieldShape(c.customizationField, {
        textValue: c.textValue ?? undefined,
        uploadedFileId: c.uploadedFileId ?? undefined,
      });
      surchargePaise += result.surchargePaise;
    }
    return this.pricingService.computeLine({
      basePricePaise,
      variantDeltaPaise,
      surchargePaise,
      quantity: item.quantity,
    });
  }

  private async loadOrderView(
    orderId: string,
    userId: string,
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order || order.userId !== userId) {
      // Unreachable via normal flow (the userId match on the idempotency
      // key already guards this) — defensive only, never leaks existence.
      throw new ConflictException('Order not found for this user');
    }
    return this.toOrderView(order);
  }

  private toOrderView(order: OrderWithItems): OrderView {
    const subtotalPaise = decimalToPaise(order.subtotal);
    const totalPaise = decimalToPaise(order.total);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotal: paiseToDecimalString(subtotalPaise),
      shippingFee: paiseToDecimalString(totalPaise - subtotalPaise),
      total: paiseToDecimalString(totalPaise),
      currency: order.currency,
      shippingRecipientName: order.shippingRecipientName,
      shippingPhone: order.shippingPhone,
      shippingAddressLine1: order.shippingAddressLine1,
      shippingAddressLine2: order.shippingAddressLine2,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        variantLabel: item.variantLabelSnapshot,
        unitPrice: paiseToDecimalString(decimalToPaise(item.unitPriceSnapshot)),
        quantity: item.quantity,
        lineTotal: paiseToDecimalString(decimalToPaise(item.lineTotal)),
        customizations: item.customizations.map((c) => ({
          fieldLabel: c.fieldLabelSnapshot,
          textValue: c.textValue,
          uploadedFileId: c.uploadedFileId,
        })),
      })),
      createdAt: order.createdAt,
    };
  }
}
