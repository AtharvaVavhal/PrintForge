import { BadRequestException } from '@nestjs/common';
import { TaxConfig, TaxService } from './tax.service';

/**
 * Phase 13.4 §3 — deterministic, Decimal-safe tax boundary. Pure math
 * only; no rate/jurisdiction is decided here.
 */
describe('TaxService.computeTax', () => {
  const service = new TaxService({} as never);

  const cfg = (over: Partial<TaxConfig> = {}): TaxConfig => ({
    enabled: false,
    mode: 'INCLUSIVE',
    ratePercent: '0',
    ...over,
  });

  it('returns zero tax when disabled — the base is the full taxable amount', () => {
    const r = service.computeTax(19900n, cfg({ enabled: false }));
    expect(r).toEqual({
      taxableAmountPaise: 19900n,
      taxAmountPaise: 0n,
      applied: false,
      mode: 'INCLUSIVE',
      taxRateSnapshot: null,
    });
  });

  it('returns zero tax when enabled but the rate is 0', () => {
    const r = service.computeTax(
      19900n,
      cfg({ enabled: true, ratePercent: '0' }),
    );
    expect(r.applied).toBe(false);
    expect(r.taxAmountPaise).toBe(0n);
    expect(r.taxRateSnapshot).toBeNull();
  });

  it('INCLUSIVE: extracts GST from within the base; net + tax === base exactly', () => {
    // base 11800 paise incl. 18% → net 10000, tax 1800
    const r = service.computeTax(
      11800n,
      cfg({ enabled: true, ratePercent: '18' }),
    );
    expect(r.applied).toBe(true);
    expect(r.taxableAmountPaise).toBe(10000n);
    expect(r.taxAmountPaise).toBe(1800n);
    expect(r.taxableAmountPaise + r.taxAmountPaise).toBe(11800n);
    expect(r.taxRateSnapshot).toBe('0.1800');
  });

  it('INCLUSIVE: rounds the net half-up to whole paise, tax absorbs the remainder', () => {
    // base 10000 paise incl. 18% → net = 10000*100/118 = 8474.576... → 8475 (HALF_UP)
    const r = service.computeTax(
      10000n,
      cfg({ enabled: true, ratePercent: '18' }),
    );
    expect(r.taxableAmountPaise).toBe(8475n);
    expect(r.taxAmountPaise).toBe(1525n);
    expect(r.taxableAmountPaise + r.taxAmountPaise).toBe(10000n);
  });

  it('EXCLUSIVE: adds GST on top; taxable base is unchanged', () => {
    // base 10000 + 18% → tax 1800, taxable 10000
    const r = service.computeTax(
      10000n,
      cfg({ enabled: true, mode: 'EXCLUSIVE', ratePercent: '18' }),
    );
    expect(r.taxableAmountPaise).toBe(10000n);
    expect(r.taxAmountPaise).toBe(1800n);
    expect(r.mode).toBe('EXCLUSIVE');
    expect(r.taxRateSnapshot).toBe('0.1800');
  });

  it('EXCLUSIVE: rounds tax half-up to whole paise', () => {
    // 333 * 5% = 16.65 → 17
    const r = service.computeTax(
      333n,
      cfg({ enabled: true, mode: 'EXCLUSIVE', ratePercent: '5' }),
    );
    expect(r.taxAmountPaise).toBe(17n);
  });

  it('supports a fractional rate', () => {
    const r = service.computeTax(
      10250n,
      cfg({ enabled: true, ratePercent: '2.5' }),
    );
    // net = 10250*100/102.5 = 10000, tax 250
    expect(r.taxableAmountPaise).toBe(10000n);
    expect(r.taxAmountPaise).toBe(250n);
    expect(r.taxRateSnapshot).toBe('0.0250');
  });

  it('handles a zero base', () => {
    const r = service.computeTax(0n, cfg({ enabled: true, ratePercent: '18' }));
    expect(r.taxableAmountPaise).toBe(0n);
    expect(r.taxAmountPaise).toBe(0n);
  });

  it('rejects a negative base', () => {
    expect(() =>
      service.computeTax(-1n, cfg({ enabled: true, ratePercent: '18' })),
    ).toThrow(BadRequestException);
  });

  it('rejects an out-of-range rate', () => {
    expect(() =>
      service.computeTax(100n, cfg({ enabled: true, ratePercent: '150' })),
    ).toThrow(BadRequestException);
    expect(() =>
      service.computeTax(100n, cfg({ enabled: true, ratePercent: '-1' })),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-numeric rate', () => {
    expect(() =>
      service.computeTax(100n, cfg({ enabled: true, ratePercent: 'eighteen' })),
    ).toThrow(BadRequestException);
  });
});
