import { Injectable } from '@nestjs/common';
import { PaymentProviderType } from '@prisma/client';
import { RazorpayProviderAdapter } from '../razorpay/razorpay-provider-adapter';
import { UnsupportedPaymentProviderError } from '../payment-accounts/payment-account-resolution.errors';
import { PaymentProviderAdapter } from './payment-provider-adapter.interface';

/**
 * Phase 8 (P8-6) — docs/saas/PHASE-8-ARCHITECTURE-AND-SCHEMA-SPEC.md §5.2:
 * `PaymentProviderAdapter` resolution must be "keyed by
 * `PaymentAccount.provider` via a small registry/factory... not a single
 * app-wide DI binding" — the one deliberate departure from the existing
 * `BillingProvider` (SaaS billing, Phase 7) precedent, required because
 * Phase 8 may eventually support more than one provider even though
 * Razorpay is the only one today.
 *
 * Razorpay is the only registered provider for this stage (task scope).
 * The map shape exists so adding a second provider later is a one-line
 * addition to the constructor below, not a new resolution mechanism.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly adapters: ReadonlyMap<PaymentProviderType, PaymentProviderAdapter>;

  constructor(razorpayProviderAdapter: RazorpayProviderAdapter) {
    this.adapters = new Map([
      [PaymentProviderType.RAZORPAY, razorpayProviderAdapter],
    ]);
  }

  get(provider: PaymentProviderType): PaymentProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new UnsupportedPaymentProviderError(provider);
    }
    return adapter;
  }
}
