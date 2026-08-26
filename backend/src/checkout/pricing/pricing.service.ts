import { Injectable } from '@nestjs/common';

export interface OrderLineInput {
  basePricePaise: bigint;
  variantDeltaPaise: bigint;
  surchargePaise: bigint;
  quantity: number;
}

export interface OrderLinePricing {
  unitPricePaise: bigint;
  lineTotalPaise: bigint;
}

/**
 * Sole price authority (§24 invariant 1) — frontend-supplied
 * price/total/discount is never trusted. Pure computation, no I/O, so it
 * can be unit tested without a database. Implements the parts of §11's
 * canonical formula MVP scope actually needs (unit price, line total,
 * subtotal, total with flat shipping and zero discount — coupons are out
 * of MVP, §32). The GST/tax line itself is deliberately not computed here:
 * that piece is gated on §4's legal classification, still open; MVP
 * `total` remains tax-inclusive display-only regardless.
 */
@Injectable()
export class PricingService {
  /** unitPrice embeds the surcharge once; never re-added at line/cart level (§11). */
  computeLine(input: OrderLineInput): OrderLinePricing {
    const unitPricePaise =
      input.basePricePaise + input.variantDeltaPaise + input.surchargePaise;
    return {
      unitPricePaise,
      lineTotalPaise: unitPricePaise * BigInt(input.quantity),
    };
  }

  sumLineTotals(lines: readonly OrderLinePricing[]): bigint {
    return lines.reduce((sum, line) => sum + line.lineTotalPaise, 0n);
  }

  /** total = subtotal − discount + shippingFee (§11); discount defaults to 0 (no coupons in MVP). */
  computeOrderTotal(params: {
    subtotalPaise: bigint;
    shippingFeePaise: bigint;
    discountPaise?: bigint;
  }): bigint {
    const discountPaise = params.discountPaise ?? 0n;
    return params.subtotalPaise - discountPaise + params.shippingFeePaise;
  }
}
