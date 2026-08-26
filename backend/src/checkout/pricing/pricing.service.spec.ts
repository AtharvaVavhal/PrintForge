import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const service = new PricingService();

  it('computes unit price and line total embedding surcharge once', () => {
    const result = service.computeLine({
      basePricePaise: 30000n,
      variantDeltaPaise: 2500n,
      surchargePaise: 2250n,
      quantity: 2,
    });
    expect(result.unitPricePaise).toBe(34750n);
    expect(result.lineTotalPaise).toBe(69500n);
  });

  it('sums line totals for subtotal', () => {
    const subtotal = service.sumLineTotals([
      { unitPricePaise: 100n, lineTotalPaise: 200n },
      { unitPricePaise: 300n, lineTotalPaise: 900n },
    ]);
    expect(subtotal).toBe(1100n);
  });

  it('computes total as subtotal - discount + shipping', () => {
    const total = service.computeOrderTotal({
      subtotalPaise: 69500n,
      shippingFeePaise: 5000n,
    });
    expect(total).toBe(74500n);
  });

  it('defaults discount to zero when omitted (MVP has no coupons)', () => {
    const total = service.computeOrderTotal({
      subtotalPaise: 1000n,
      shippingFeePaise: 0n,
    });
    expect(total).toBe(1000n);
  });
});
