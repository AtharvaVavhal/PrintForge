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
});
