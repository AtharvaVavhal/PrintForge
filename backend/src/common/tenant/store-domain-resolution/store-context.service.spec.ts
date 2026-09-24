import { NotFoundException } from '@nestjs/common';
import {
  StoreContextService,
  StorefrontRequest,
} from './store-context.service';
import { StoreNotFoundException } from './store-resolution.exceptions';

jest.mock('../primary-store', () => ({
  resolvePrimaryStoreId: jest.fn(),
}));
import { resolvePrimaryStoreId } from '../primary-store';

/**
 * Phase 9 W3 — the façade (spec §4.4/§4.5): mode selection via the W2
 * kill-switch, §4.1.2 steps 1–2 on the `Origin` header, memoisation on
 * `request.storeContext`, the legacy strategy kept verbatim, and the
 * merchant-preference shortcut. `Host` is never consulted in
 * `host_resolution` mode.
 */
describe('StoreContextService (spec §4.4 façade)', () => {
  const getMode = jest.fn();
  const resolveHost = jest.fn();
  const legacyResolveTenantId = jest.fn();
  const primaryStore = resolvePrimaryStoreId as jest.Mock;

  function make(env: 'production' | 'test'): StoreContextService {
    const config = { get: jest.fn().mockReturnValue(env) } as never;
    return new StoreContextService(
      {} as never,
      { getMode } as never,
      { resolveHost } as never,
      { resolveTenantId: legacyResolveTenantId } as never,
      config,
    );
  }

  function req(over: Partial<StorefrontRequest> = {}): StorefrontRequest {
    return { hostname: 'api.printforge.in', headers: {}, ...over };
  }

  beforeEach(() => {
    getMode.mockReset();
    resolveHost.mockReset();
    legacyResolveTenantId.mockReset();
    primaryStore.mockReset();
  });

  describe('legacy_single_store', () => {
    it('§4.5: uses the pre-Phase-9 resolver on request.hostname, then the primary store; never reads Origin', async () => {
      getMode.mockResolvedValue({
        mode: 'legacy_single_store',
        source: 'default',
      });
      legacyResolveTenantId.mockResolvedValue('t1');
      primaryStore.mockResolvedValue('s1');
      const r = req({ headers: { origin: 'https://forged.example' } });
      await expect(make('production').resolve(r)).resolves.toEqual({
        storeId: 's1',
        tenantId: 't1',
        storeDomainId: null,
        isPrimary: true,
        canonicalOrigin: null,
        resolvedBy: 'legacy',
      });
      expect(legacyResolveTenantId).toHaveBeenCalledWith('api.printforge.in');
      expect(resolveHost).not.toHaveBeenCalled();
      expect(r.storeContext?.resolvedBy).toBe('legacy');
    });

    it('§4.5 kept verbatim: a tenant with no primary store still resolves (storeId null) — never a 404 in legacy mode', async () => {
      getMode.mockResolvedValue({
        mode: 'legacy_single_store',
        source: 'default',
      });
      legacyResolveTenantId.mockResolvedValue('t-no-store');
      primaryStore.mockRejectedValue(
        new NotFoundException('This tenant has no primary store configured'),
      );
      await expect(make('test').resolve(req())).resolves.toMatchObject({
        tenantId: 't-no-store',
        storeId: null,
        resolvedBy: 'legacy',
      });
    });

    it('§4.5: any other primary-store failure still propagates', async () => {
      getMode.mockResolvedValue({
        mode: 'legacy_single_store',
        source: 'default',
      });
      legacyResolveTenantId.mockResolvedValue('t1');
      primaryStore.mockRejectedValue(new Error('db down'));
      await expect(make('test').resolve(req())).rejects.toThrow('db down');
    });
  });

  describe('host_resolution', () => {
    beforeEach(() =>
      getMode.mockResolvedValue({ mode: 'host_resolution', source: 'row' }),
    );

    it('R-13: absent Origin → 404; legacy resolver NEVER consulted (no most-recent-tenant fallback)', async () => {
      await expect(make('production').resolve(req())).rejects.toBeInstanceOf(
        StoreNotFoundException,
      );
      expect(legacyResolveTenantId).not.toHaveBeenCalled();
      expect(resolveHost).not.toHaveBeenCalled();
    });

    it.each(['null', 'https://a.example/path', 'ftp://a.example', 'a.example'])(
      'R-13: malformed Origin %j → 404 before any lookup',
      async (origin) => {
        await expect(
          make('production').resolve(req({ headers: { origin } })),
        ).rejects.toBeInstanceOf(StoreNotFoundException);
        expect(resolveHost).not.toHaveBeenCalled();
        expect(legacyResolveTenantId).not.toHaveBeenCalled();
      },
    );

    it('R-7 (API host): the Host header is ignored — only Origin selects the store', async () => {
      resolveHost.mockResolvedValue({
        storeId: 's1',
        tenantId: 't1',
        resolvedBy: 'origin',
      });
      await make('production').resolve(
        req({
          hostname: 'api.printforge.in',
          headers: { origin: 'https://Shop-A.Example:443' },
        }),
      );
      expect(resolveHost).toHaveBeenCalledWith('shop-a.example', 'https');
    });

    it('requires https in production; accepts http in test', async () => {
      await expect(
        make('production').resolve(
          req({ headers: { origin: 'http://shop-a.example' } }),
        ),
      ).rejects.toBeInstanceOf(StoreNotFoundException);
      resolveHost.mockResolvedValue({
        storeId: 's1',
        tenantId: 't1',
        resolvedBy: 'origin',
      });
      await make('test').resolve(
        req({ headers: { origin: 'http://shop-a.example' } }),
      );
      expect(resolveHost).toHaveBeenCalledWith('shop-a.example', 'http');
    });

    it('memoises on request.storeContext — the pipeline runs once per request', async () => {
      resolveHost.mockResolvedValue({
        storeId: 's1',
        tenantId: 't1',
        resolvedBy: 'origin',
      });
      const r = req({ headers: { origin: 'https://shop-a.example' } });
      const svc = make('production');
      await svc.resolve(r);
      await svc.resolve(r);
      expect(resolveHost).toHaveBeenCalledTimes(1);
      expect(getMode).toHaveBeenCalledTimes(1);
    });

    it('a failed resolution never leaves a partial context on the request (§4.1.2: context only after every gate)', async () => {
      resolveHost.mockRejectedValue(new StoreNotFoundException());
      const r = req({ headers: { origin: 'https://shop-a.example' } });
      await expect(make('production').resolve(r)).rejects.toBeInstanceOf(
        StoreNotFoundException,
      );
      expect(r.storeContext).toBeUndefined();
    });
  });

  describe('resolvePublicScope (Phase 9 W4 — public catalog reads)', () => {
    it('legacy_single_store → undefined (unscoped), and the legacy resolver is NOT invoked for a public read', async () => {
      getMode.mockResolvedValue({
        mode: 'legacy_single_store',
        source: 'default',
      });
      await expect(
        make('test').resolvePublicScope(req()),
      ).resolves.toBeUndefined();
      expect(legacyResolveTenantId).not.toHaveBeenCalled();
      expect(resolveHost).not.toHaveBeenCalled();
    });

    it('host_resolution → the resolved store scope (tenantId + storeId) via the full pipeline', async () => {
      getMode.mockResolvedValue({ mode: 'host_resolution', source: 'row' });
      resolveHost.mockResolvedValue({
        storeId: 's1',
        tenantId: 't1',
        resolvedBy: 'origin',
      });
      await expect(
        make('production').resolvePublicScope(
          req({ headers: { origin: 'https://shop-a.example' } }),
        ),
      ).resolves.toEqual({ tenantId: 't1', storeId: 's1' });
    });

    it("host_resolution with an unresolvable Origin → the pipeline's 404 (no unscoped fallback)", async () => {
      getMode.mockResolvedValue({ mode: 'host_resolution', source: 'row' });
      await expect(
        make('production').resolvePublicScope(req()),
      ).rejects.toBeInstanceOf(StoreNotFoundException);
      expect(legacyResolveTenantId).not.toHaveBeenCalled();
    });
  });

  describe('resolveActiveTenantId', () => {
    it('prefers an existing merchant tenantContext (D6) without resolving — Origin cannot override it', async () => {
      getMode.mockResolvedValue({ mode: 'host_resolution', source: 'row' });
      const r = req({
        tenantContext: {
          tenantId: 'member-tenant',
          source: 'header',
          membership: { role: 'OWNER' },
        } as never,
        headers: { origin: 'https://forged-b.example' },
      });
      await expect(make('production').resolveActiveTenantId(r)).resolves.toBe(
        'member-tenant',
      );
      expect(getMode).not.toHaveBeenCalled();
      expect(resolveHost).not.toHaveBeenCalled();
    });

    it('otherwise resolves through resolve()', async () => {
      getMode.mockResolvedValue({ mode: 'host_resolution', source: 'row' });
      resolveHost.mockResolvedValue({
        storeId: 's1',
        tenantId: 't1',
        resolvedBy: 'origin',
      });
      await expect(
        make('production').resolveActiveTenantId(
          req({ headers: { origin: 'https://shop-a.example' } }),
        ),
      ).resolves.toBe('t1');
    });
  });
});
