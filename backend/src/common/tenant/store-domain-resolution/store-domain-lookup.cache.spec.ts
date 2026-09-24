import {
  STORE_DOMAIN_LOOKUP_CACHE_TTL_MS,
  StoreDomainLookupCache,
  StoreDomainLookupRow,
} from './store-domain-lookup.cache';

const row: StoreDomainLookupRow = {
  id: 'd1',
  hostname: 'a.example',
  storeId: 's1',
  tenantId: 't1',
  type: 'CUSTOM',
  verificationStatus: 'VERIFIED',
  tlsStatus: 'ISSUED',
  isPrimary: true,
  primaryHostname: 'a.example',
};

/** Phase 9 W3 — spec §4.6: host → row cache, TTL 15 s, cached misses, explicit bust. */
describe('StoreDomainLookupCache (spec §4.6)', () => {
  beforeEach(() => jest.useFakeTimers({ now: 0 }));
  afterEach(() => jest.useRealTimers());

  it('distinguishes "not cached" (undefined) from a cached miss (null)', () => {
    const cache = new StoreDomainLookupCache();
    expect(cache.get('a.example')).toBeUndefined();
    cache.set('a.example', null);
    expect(cache.get('a.example')).toBeNull();
  });

  it('serves a cached row for exactly one TTL, then expires it', () => {
    const cache = new StoreDomainLookupCache();
    cache.set('a.example', row);
    jest.advanceTimersByTime(STORE_DOMAIN_LOOKUP_CACHE_TTL_MS - 1);
    expect(cache.get('a.example')).toEqual(row);
    jest.advanceTimersByTime(1);
    expect(cache.get('a.example')).toBeUndefined();
  });

  it('bust(host) drops one entry; bust() drops all', () => {
    const cache = new StoreDomainLookupCache();
    cache.set('a.example', row);
    cache.set('b.example', null);
    cache.bust('a.example');
    expect(cache.get('a.example')).toBeUndefined();
    expect(cache.get('b.example')).toBeNull();
    cache.bust();
    expect(cache.get('b.example')).toBeUndefined();
  });
});
