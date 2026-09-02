import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

export type TaxPricingMode = 'INCLUSIVE' | 'EXCLUSIVE';

/**
 * The tax treatment in force at a point in time. Sourced from the
 * allowlisted, server-validated admin settings (app-setting.constants.ts):
 *   tax.enabled      -> `enabled`   (default false — no tax until a client
 *                                    confirms the rate)
 *   tax.pricingMode  -> `mode`      (default INCLUSIVE — BLUEPRINT §4 /
 *                                    pricing.service.ts establish that
 *                                    displayed prices already include tax)
 *   tax.ratePercent  -> `ratePercent` (single combined GST %, e.g. "18";
 *                                    "0" until set)
 */
export interface TaxConfig {
  enabled: boolean;
  mode: TaxPricingMode;
  /** Combined GST percentage as a decimal string, e.g. "18" or "18.5". */
  ratePercent: string;
}

export interface TaxComputation {
  /** Net-of-tax base, in paise. */
  taxableAmountPaise: bigint;
  /** GST component, in paise (0 when not applied). */
  taxAmountPaise: bigint;
  /** True only when tax is enabled AND the rate is > 0. */
  applied: boolean;
  mode: TaxPricingMode;
  /** Fractional rate snapshot (e.g. "0.1800"), or null when not applied. */
  taxRateSnapshot: string | null;
}

const TAX_ENABLED_KEY = 'tax.enabled';
const TAX_MODE_KEY = 'tax.pricingMode';
const TAX_RATE_KEY = 'tax.ratePercent';

/**
 * Deterministic, Decimal-safe tax boundary (Phase 13.4 §3).
 *
 * `computeTax` is pure — no I/O, no floats. All arithmetic goes through
 * Prisma.Decimal with an explicit ROUND_HALF_UP to 0 places (paise),
 * matching money.util.ts's `decimalToPaise`. The result is reproducible
 * from the persisted order (taxableAmount / taxAmount / taxRateSnapshot /
 * taxMode) alone — it never re-reads current config.
 *
 * The actual rate and jurisdiction (CGST/SGST/IGST split, place of supply,
 * whether shipping is taxable) are NOT decided here — they are pending
 * client confirmation. Until `tax.enabled` is turned on with a confirmed
 * rate, every order carries taxAmount = 0 and `total` is unchanged.
 */
@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Reads the current config directly from app_settings (same pattern as
   * CheckoutService.getShippingFeePaise). Pass the checkout transaction
   * client so the config read is part of that transaction. */
  async getConfig(
    client: Pick<PrismaService, 'appSetting'> = this.prisma,
  ): Promise<TaxConfig> {
    const rows = await client.appSetting.findMany({
      where: { key: { in: [TAX_ENABLED_KEY, TAX_MODE_KEY, TAX_RATE_KEY] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const mode: TaxPricingMode =
      map.get(TAX_MODE_KEY) === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'INCLUSIVE';
    if (mode === 'EXCLUSIVE') {
      // Phase 13.4 hardening — the admin API/UI cannot set this (see
      // app-setting.constants.ts). If it is somehow active (a direct DB
      // write, or a deliberate future rollout), it is never silent:
      // tax-EXCLUSIVE adds GST on top of the customer/Razorpay total.
      this.logger.warn(
        'Tax pricing mode is EXCLUSIVE — GST is added on top and increases customer/Razorpay totals. This should only be active after explicit business confirmation of inclusive-vs-exclusive pricing.',
      );
    }
    return {
      enabled: map.get(TAX_ENABLED_KEY) === 'true',
      mode,
      ratePercent: map.get(TAX_RATE_KEY) ?? '0',
    };
  }

  /**
   * @param baseGoodsPaise for INCLUSIVE mode: the tax-inclusive goods value
   *        (subtotal − discount). For EXCLUSIVE mode: the pre-tax base.
   */
  computeTax(baseGoodsPaise: bigint, config: TaxConfig): TaxComputation {
    if (baseGoodsPaise < 0n) {
      throw new BadRequestException('Tax base cannot be negative');
    }

    const rate = this.parseRate(config);

    if (!config.enabled || rate.isZero()) {
      return {
        taxableAmountPaise: baseGoodsPaise,
        taxAmountPaise: 0n,
        applied: false,
        mode: config.mode,
        taxRateSnapshot: null,
      };
    }

    const base = new Prisma.Decimal(baseGoodsPaise.toString());
    const rateSnapshot = rate.div(100).toDecimalPlaces(4).toFixed(4);

    if (config.mode === 'INCLUSIVE') {
      // net = base * 100 / (100 + rate); tax = base − net  (they sum to
      // `base` exactly — no rounding drift).
      const net = base
        .mul(100)
        .div(new Prisma.Decimal(100).plus(rate))
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
      const taxableAmountPaise = BigInt(net.toFixed(0));
      return {
        taxableAmountPaise,
        taxAmountPaise: baseGoodsPaise - taxableAmountPaise,
        applied: true,
        mode: 'INCLUSIVE',
        taxRateSnapshot: rateSnapshot,
      };
    }

    // EXCLUSIVE: tax = base * rate / 100; taxable base is unchanged.
    const tax = base
      .mul(rate)
      .div(100)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    return {
      taxableAmountPaise: baseGoodsPaise,
      taxAmountPaise: BigInt(tax.toFixed(0)),
      applied: true,
      mode: 'EXCLUSIVE',
      taxRateSnapshot: rateSnapshot,
    };
  }

  private parseRate(config: TaxConfig): Prisma.Decimal {
    let rate: Prisma.Decimal;
    try {
      rate = new Prisma.Decimal(config.ratePercent);
    } catch {
      throw new BadRequestException(`Invalid tax rate "${config.ratePercent}"`);
    }
    if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(100)) {
      throw new BadRequestException(
        `Tax rate must be between 0 and 100 (got "${config.ratePercent}")`,
      );
    }
    return rate;
  }
}
