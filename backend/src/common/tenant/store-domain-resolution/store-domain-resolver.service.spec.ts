import { Logger } from '@nestjs/common';
import { StoreDomainLookupCache } from './store-domain-lookup.cache';
import { StoreDomainResolver } from './store-domain-resolver.service';
import {
  StoreNotFoundException,
  StoreUnavailableException,
} from './store-resolution.exceptions';

/**
 * Phase 9 W3 — the §4.3 pipeline (steps 3–5 of §4.1.2) with a fake Prisma.
 * `withPlatformRlsBypass` runs its callback inside `prisma.$transaction`,
 * so the fake transaction client carries the three delegates the resolver
 * touches plus a no-op `$executeRaw` for the bypass GUC.
 */
describe('StoreDomainResolver (spec §4.3 pipeline)', () => {
  const storeDomainFindUnique = jest.fn();
  const storeFindUnique = jest.fn();
  const tenantFindUnique = jest.fn();
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    storeDomain: { findUnique: storeDomainFindUnique },
    store: { findUnique: storeFindUnique },
    tenant: { findUnique: tenantFindUnique },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as ConstructorParameters<typeof StoreDomainResolver>[0];

  let cache: StoreDomainLookupCache;
  let resolver: StoreDomainResolver;
  let warn: jest.SpyInstance;

  function domainRow(
    over: Partial<{
      type: 'PLATFORM_SUBDOMAIN' | 'CUSTOM' | null;
      verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
      tlsStatus: 'PENDING' | 'ISSUED' | 'ERROR' | null;
      isPrimary: boolean;
      primary: string | null;
    }> = {},
  ) {
    return {
      id: 'd1',
      hostname: 'shop-a.example',
      storeId: 's1',
      tenantId: 't1',
      type: over.type === undefined ? 'CUSTOM' : over.type,
      verificationStatus: over.verificationStatus ?? 'VERIFIED',
      tlsStatus: over.tlsStatus === undefined ? 'ISSUED' : over.tlsStatus,
      isPrimary: over.isPrimary ?? true,
      store: {
        domains:
          over.primary === null
            ? []
            : [{ hostname: over.primary ?? 'shop-a.example' }],
      },
    };
  }

  function live(
    store: 'ACTIVE' | 'DISABLED' | 'DRAFT' | null = 'ACTIVE',
    tenant:
      'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED' | null = 'ACTIVE',
    subscription: string | null = 'ACTIVE',
  ) {
    storeFindUnique.mockResolvedValueOnce(store ? { status: store } : null);
    tenantFindUnique.mockResolvedValueOnce(
      tenant
        ? {
            status: tenant,
            subscription: subscription ? { status: subscription } : null,
          }
        : null,
    );
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
    storeDomainFindUnique.mockReset();
    storeFindUnique.mockReset();
    tenantFindUnique.mockReset();
    cache = new StoreDomainLookupCache();
    resolver = new StoreDomainResolver(prisma, cache);
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
  });

  it('R-1: unknown host → StoreNotFoundException (404); the miss is cached', async () => {
    storeDomainFindUnique.mockResolvedValueOnce(null);
    await expect(
      resolver.resolveHost('nope.example', 'https'),
    ).rejects.toBeInstanceOf(StoreNotFoundException);
    await expect(
      resolver.resolveHost('nope.example', 'https'),
    ).rejects.toBeInstanceOf(StoreNotFoundException);
    expect(storeDomainFindUnique).toHaveBeenCalledTimes(1);
    expect(storeFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['PENDING', 'ISSUED'],
    ['FAILED', 'ISSUED'],
    ['VERIFIED', 'PENDING'],
    ['VERIFIED', 'ERROR'],
    ['VERIFIED', null],
  ] as const)(
    'R-2/R-3: CUSTOM row verificationStatus=%s tlsStatus=%s → NOT_SERVED as the same 404; liveness never consulted',
    async (verificationStatus, tlsStatus) => {
      storeDomainFindUnique.mockResolvedValueOnce(
        domainRow({ verificationStatus, tlsStatus }),
      );
      await expect(
        resolver.resolveHost('shop-a.example', 'https'),
      ).rejects.toBeInstanceOf(StoreNotFoundException);
      expect(storeFindUnique).not.toHaveBeenCalled();
    },
  );

  it('R-10: type IS NULL reads as CUSTOM (fail-closed) — served only when VERIFIED + ISSUED', async () => {
    storeDomainFindUnique.mockResolvedValueOnce(
      domainRow({ type: null, tlsStatus: null }),
    );
    await expect(
      resolver.resolveHost('shop-a.example', 'https'),
    ).rejects.toBeInstanceOf(StoreNotFoundException);
    cache.bust();
    storeDomainFindUnique.mockResolvedValueOnce(
      domainRow({ type: null, tlsStatus: 'ISSUED' }),
    );
    live();
    await expect(
      resolver.resolveHost('shop-a.example', 'https'),
    ).resolves.toMatchObject({
      storeId: 's1',
      tenantId: 't1',
    });
  });

  it('PLATFORM_SUBDOMAIN rows are always-on: verification/TLS not consulted', async () => {
    storeDomainFindUnique.mockResolvedValueOnce(
      domainRow({
        type: 'PLATFORM_SUBDOMAIN',
        verificationStatus: 'PENDING',
        tlsStatus: null,
      }),
    );
    live();
    await expect(
      resolver.resolveHost('shop-a.example', 'https'),
    ).resolves.toEqual({
      storeId: 's1',
      tenantId: 't1',
      storeDomainId: 'd1',
      isPrimary: true,
      canonicalOrigin: 'https://shop-a.example',
      resolvedBy: 'origin',
    });
  });

  it.each([
    ['R-5/R-8 store DISABLED', 'DISABLED', 'ACTIVE', 'ACTIVE'],
    ['R-8 store DRAFT', 'DRAFT', 'ACTIVE', 'ACTIVE'],
    ['R-6 tenant SUSPENDED', 'ACTIVE', 'SUSPENDED', 'ACTIVE'],
    ['tenant PENDING_DELETION', 'ACTIVE', 'PENDING_DELETION', 'ACTIVE'],
    ['R-7 subscription EXPIRED', 'ACTIVE', 'ACTIVE', 'EXPIRED'],
    ['store row missing', null, 'ACTIVE', 'ACTIVE'],
  ] as const)(
    '%s → StoreUnavailableException (503), reason logged server-side only',
    async (_label, store, tenant, subscription) => {
      storeDomainFindUnique.mockResolvedValueOnce(domainRow());
      live(store, tenant, subscription);
      await expect(
        resolver.resolveHost('shop-a.example', 'https'),
      ).rejects.toBeInstanceOf(StoreUnavailableException);
      expect(warn).toHaveBeenCalledTimes(1);
      const firstWarn = warn.mock.calls[0] as unknown[];
      expect(String(firstWarn[0])).toContain('t1');
    },
  );

  it.each([
    'PAST_DUE',
    'PAUSED',
    'CANCELLED',
    'TRIALING',
    'PENDING',
    null,
  ] as const)(
    'subscription %s does NOT block serving (only EXPIRED does — §4.3)',
    async (subscription) => {
      storeDomainFindUnique.mockResolvedValueOnce(domainRow());
      live('ACTIVE', 'ACTIVE', subscription);
      await expect(
        resolver.resolveHost('shop-a.example', 'https'),
      ).resolves.toMatchObject({
        tenantId: 't1',
      });
    },
  );

  it('R-4: a non-primary served host is RESOLVED (not a redirect) with canonicalOrigin = the primary hostname', async () => {
    storeDomainFindUnique.mockResolvedValueOnce(
      domainRow({ isPrimary: false, primary: 'www.shop-a.example' }),
    );
    live();
    await expect(
      resolver.resolveHost('shop-a.example', 'https'),
    ).resolves.toEqual({
      storeId: 's1',
      tenantId: 't1',
      storeDomainId: 'd1',
      isPrimary: false,
      canonicalOrigin: 'https://www.shop-a.example',
      resolvedBy: 'origin',
    });
  });

  it('canonicalOrigin falls back to the matched hostname when the store has no primary row; scheme follows the caller', async () => {
    storeDomainFindUnique.mockResolvedValueOnce(domainRow({ primary: null }));
    live();
    await expect(
      resolver.resolveHost('shop-a.example', 'http'),
    ).resolves.toMatchObject({
      canonicalOrigin: 'http://shop-a.example',
    });
  });

  it('§4.6: the domain row is cached for one TTL, but Store/Tenant liveness is read LIVE on every resolution', async () => {
    storeDomainFindUnique.mockResolvedValueOnce(domainRow());
    live();
    await resolver.resolveHost('shop-a.example', 'https');
    live('DISABLED');
    await expect(
      resolver.resolveHost('shop-a.example', 'https'),
    ).rejects.toBeInstanceOf(StoreUnavailableException);
    expect(storeDomainFindUnique).toHaveBeenCalledTimes(1);
    expect(storeFindUnique).toHaveBeenCalledTimes(2);
  });

  it('R-11: after a bust, a row revoked to FAILED is refused on the very next resolution', async () => {
    storeDomainFindUnique.mockResolvedValueOnce(domainRow());
    live();
    await resolver.resolveHost('shop-a.example', 'https');
    cache.bust('shop-a.example');
    storeDomainFindUnique.mockResolvedValueOnce(
      domainRow({ verificationStatus: 'FAILED' }),
    );
    await expect(
      resolver.resolveHost('shop-a.example', 'https'),
    ).rejects.toBeInstanceOf(StoreNotFoundException);
  });
});
