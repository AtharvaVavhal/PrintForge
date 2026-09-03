import {
  getAdminSettingDefinition,
  isPublicSettingKey,
} from './app-setting.constants';

describe('app-setting constants — public allowlist & store identity', () => {
  it('exposes storeName to the public storefront read surface', () => {
    expect(isPublicSettingKey('storeName')).toBe(true);
  });

  it('does NOT expose storeAdminName publicly — it is store-owner information', () => {
    expect(isPublicSettingKey('storeAdminName')).toBe(false);
  });

  it('keeps internal keys non-public', () => {
    expect(isPublicSettingKey('order_number_counter')).toBe(false);
    expect(isPublicSettingKey('tax.ratePercent')).toBe(false);
    expect(isPublicSettingKey('invoice.sellerGstin')).toBe(false);
  });

  it('declares storeName with the "PrintForge" default and storeAdminName blank', () => {
    expect(getAdminSettingDefinition('storeName')).toMatchObject({
      kind: 'text',
      default: 'PrintForge',
    });
    expect(getAdminSettingDefinition('storeAdminName')).toMatchObject({
      kind: 'text',
      default: '',
    });
  });
});
