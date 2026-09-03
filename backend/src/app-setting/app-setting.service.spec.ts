import { BadRequestException } from '@nestjs/common';
import { AppSettingService } from './app-setting.service';

/**
 * Focused on the Phase 13.2 additions — listConfigurable / updateConfigurable
 * and the per-key server-side validation in app-setting.constants.ts. Same
 * direct-instantiation mocking pattern as products.service.spec.ts. The
 * public read paths (get / getMany) are exercised end-to-end in
 * test/e2e/admin-control-plane.e2e-spec.ts.
 */
describe('AppSettingService — configurable settings', () => {
  function buildService(stored: Record<string, string> = {}) {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      appSetting: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: { key: string } }) =>
            Promise.resolve(
              stored[where.key] !== undefined
                ? { value: stored[where.key] }
                : null,
            ),
          ),
        findMany: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { key: { in: string[] } } }) =>
              Promise.resolve(
                where.key.in
                  .filter((k) => stored[k] !== undefined)
                  .map((k) => ({ key: k, value: stored[k] })),
              ),
          ),
        upsert,
      },
    };
    const service = new AppSettingService(prisma as never);
    return { service, upsert };
  }

  describe('listConfigurable', () => {
    it('returns every defined setting, falling back to the default when no row exists', async () => {
      const { service } = buildService();
      const list = await service.listConfigurable();

      const shipping = list.find((s) => s.key === 'shippingFeeFlat');
      const announcement = list.find((s) => s.key === 'announcement_text');
      expect(shipping).toMatchObject({
        kind: 'money',
        value: '0.00',
        default: '0.00',
      });
      expect(announcement).toMatchObject({
        kind: 'text',
        value: '',
        default: '',
      });
    });

    it('reflects the stored value when a row exists', async () => {
      const { service } = buildService({ shippingFeeFlat: '49.00' });
      const list = await service.listConfigurable();
      expect(list.find((s) => s.key === 'shippingFeeFlat')?.value).toBe(
        '49.00',
      );
    });

    it('never includes internal keys such as the order-number counter', async () => {
      const { service } = buildService({ order_number_counter: '17' });
      const list = await service.listConfigurable();
      expect(list.map((s) => s.key)).not.toContain('order_number_counter');
    });
  });

  describe('updateConfigurable — shipping fee', () => {
    it('accepts a valid non-negative amount and stores a canonical 2dp string', async () => {
      const { service, upsert } = buildService();
      const view = await service.updateConfigurable('shippingFeeFlat', '49');
      expect(view.value).toBe('49.00');
      expect(upsert).toHaveBeenCalledWith({
        where: { key: 'shippingFeeFlat' },
        update: { value: '49.00' },
        create: { key: 'shippingFeeFlat', value: '49.00' },
      });
    });

    it('accepts 0 (free shipping)', async () => {
      const { service } = buildService();
      const view = await service.updateConfigurable('shippingFeeFlat', '0');
      expect(view.value).toBe('0.00');
    });

    it('rejects a negative amount', async () => {
      const { service, upsert } = buildService();
      await expect(
        service.updateConfigurable('shippingFeeFlat', '-5'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric amount', async () => {
      const { service } = buildService();
      await expect(
        service.updateConfigurable('shippingFeeFlat', 'free'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects more than 2 decimal places', async () => {
      const { service } = buildService();
      await expect(
        service.updateConfigurable('shippingFeeFlat', '9.999'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an absurdly large amount', async () => {
      const { service } = buildService();
      await expect(
        service.updateConfigurable('shippingFeeFlat', '100000.01'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateConfigurable — announcement text', () => {
    it('trims and stores the text', async () => {
      const { service, upsert } = buildService();
      const view = await service.updateConfigurable(
        'announcement_text',
        '  Free shipping this week  ',
      );
      expect(view.value).toBe('Free shipping this week');
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { value: 'Free shipping this week' },
        }),
      );
    });

    it('allows an empty string (hides the bar)', async () => {
      const { service } = buildService();
      const view = await service.updateConfigurable('announcement_text', '   ');
      expect(view.value).toBe('');
    });

    it('rejects text over the length limit', async () => {
      const { service } = buildService();
      await expect(
        service.updateConfigurable('announcement_text', 'x'.repeat(201)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateConfigurable — tax settings (Phase 13.4)', () => {
    it('accepts tax.enabled true/false and normalizes case', async () => {
      const { service } = buildService();
      expect(
        (await service.updateConfigurable('tax.enabled', 'TRUE')).value,
      ).toBe('true');
      expect(
        (await service.updateConfigurable('tax.enabled', 'false')).value,
      ).toBe('false');
    });

    it('rejects a non-boolean tax.enabled', async () => {
      const { service } = buildService();
      await expect(
        service.updateConfigurable('tax.enabled', 'yes'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts INCLUSIVE and rejects an unknown pricing mode', async () => {
      const { service } = buildService();
      expect(
        (await service.updateConfigurable('tax.pricingMode', 'INCLUSIVE'))
          .value,
      ).toBe('INCLUSIVE');
      await expect(
        service.updateConfigurable('tax.pricingMode', 'HYBRID'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('LOCKS tax-EXCLUSIVE pricing — it cannot be set via the admin path (Phase 13.4 hardening)', async () => {
      const { service, upsert } = buildService();
      await expect(
        service.updateConfigurable('tax.pricingMode', 'EXCLUSIVE'),
      ).rejects.toThrow(/business confirmation/i);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('only offers INCLUSIVE as a selectable pricing mode', async () => {
      const { service } = buildService();
      const list = await service.listConfigurable();
      const mode = list.find((s) => s.key === 'tax.pricingMode');
      expect(mode?.options).toEqual(['INCLUSIVE']);
    });

    it('accepts a GST rate in 0..100 with 2dp, rejects out-of-range / junk', async () => {
      const { service } = buildService();
      expect(
        (await service.updateConfigurable('tax.ratePercent', '18')).value,
      ).toBe('18.00');
      for (const bad of ['-1', '150', 'eighteen', '5.005']) {
        await expect(
          service.updateConfigurable('tax.ratePercent', bad),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('surfaces the pending-client-input flag on the tax rate', async () => {
      const { service } = buildService();
      const list = await service.listConfigurable();
      const rate = list.find((s) => s.key === 'tax.ratePercent');
      expect(rate?.pendingClientInput).toBe(true);
      expect(rate?.value).toBe('0.00');
    });
  });

  describe('updateConfigurable — invoice settings (Phase 13.4)', () => {
    it('validates the invoice prefix', async () => {
      const { service } = buildService();
      expect(
        (await service.updateConfigurable('invoice.numberPrefix', 'inv/'))
          .value,
      ).toBe('INV/');
      await expect(
        service.updateConfigurable('invoice.numberPrefix', 'has spaces'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a blank GSTIN (pending) but rejects a malformed one', async () => {
      const { service } = buildService();
      expect(
        (await service.updateConfigurable('invoice.sellerGstin', '')).value,
      ).toBe('');
      expect(
        (
          await service.updateConfigurable(
            'invoice.sellerGstin',
            '22aaaaa0000a1z5',
          )
        ).value,
      ).toBe('22AAAAA0000A1Z5');
      await expect(
        service.updateConfigurable('invoice.sellerGstin', 'NOT-A-GSTIN'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ships the seller identity fields blank and pending', async () => {
      const { service } = buildService();
      const list = await service.listConfigurable();
      const name = list.find((s) => s.key === 'invoice.sellerLegalName');
      expect(name?.value).toBe('');
      expect(name?.pendingClientInput).toBe(true);
    });
  });

  describe('updateConfigurable — unknown / internal keys', () => {
    it('rejects a key that is not in the definition list', async () => {
      const { service, upsert } = buildService();
      await expect(
        service.updateConfigurable('order_number_counter', '0'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateConfigurable('anything_else', 'x'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('store identity — storeName / storeAdminName', () => {
    it('defaults storeName to "PrintForge" when no row exists (backward compatibility)', async () => {
      const { service } = buildService();
      const list = await service.listConfigurable();
      const storeName = list.find((s) => s.key === 'storeName');
      expect(storeName).toMatchObject({
        kind: 'text',
        value: 'PrintForge',
        default: 'PrintForge',
      });
    });

    it('defaults storeAdminName to an empty string (no name field to seed from)', async () => {
      const { service } = buildService();
      const list = await service.listConfigurable();
      const adminName = list.find((s) => s.key === 'storeAdminName');
      expect(adminName).toMatchObject({ value: '', default: '' });
    });

    it('reflects a stored store name over the default', async () => {
      const { service } = buildService({ storeName: 'Atharva Prints' });
      const list = await service.listConfigurable();
      expect(list.find((s) => s.key === 'storeName')?.value).toBe(
        'Atharva Prints',
      );
    });

    it('accepts and trims a new store name', async () => {
      const { service, upsert } = buildService();
      const view = await service.updateConfigurable(
        'storeName',
        '  Atharva Prints  ',
      );
      expect(view.value).toBe('Atharva Prints');
      expect(upsert).toHaveBeenCalledWith({
        where: { key: 'storeName' },
        update: { value: 'Atharva Prints' },
        create: { key: 'storeName', value: 'Atharva Prints' },
      });
    });

    it('rejects an empty / whitespace-only store name (required)', async () => {
      const { service, upsert } = buildService();
      await expect(
        service.updateConfigurable('storeName', '   '),
      ).rejects.toThrow(/store name is required/i);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects a store name over 60 characters', async () => {
      const { service } = buildService();
      await expect(
        service.updateConfigurable('storeName', 'x'.repeat(61)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts and trims a store admin name', async () => {
      const { service } = buildService();
      const view = await service.updateConfigurable(
        'storeAdminName',
        '  Atharva Vavhal  ',
      );
      expect(view.value).toBe('Atharva Vavhal');
    });

    it('allows an empty store admin name (optional)', async () => {
      const { service } = buildService();
      const view = await service.updateConfigurable('storeAdminName', '   ');
      expect(view.value).toBe('');
    });

    it('rejects a store admin name over its length limit', async () => {
      const { service } = buildService();
      await expect(
        service.updateConfigurable('storeAdminName', 'x'.repeat(121)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
