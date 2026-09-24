import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type {
  DomainVerificationStatus,
  StoreDomainType,
  TlsStatus,
} from '@prisma/client';
import { StorefrontResolutionModeService } from '../../../../platform/platform-config/storefront-resolution-mode.service';
import { StorefrontResolutionModeUnavailableException } from '../../../../platform/platform-config/storefront-resolution-mode-unavailable.exception';
import type { StoreDomainLookupRow } from '../store-domain-lookup.cache';
import { StoreDomainResolver } from '../store-domain-resolver.service';
import { StorefrontCorsPolicy } from './storefront-cors.policy';

/**
 * Phase 9 W7 — the CORS predicate (spec §9, §14.4; ⚖️ S-9). Pure unit level:
 * the mode service and the shared `§4.6` lookup are both doubles, so every
 * branch of the allow-list is exercised directly. The same matrix is then
 * proven over real HTTP, real guards and real Postgres in
 * `test/e2e/storefront-cors.e2e-spec.ts`.
 */
const PLATFORM_DOMAIN = 'stores.printforge.test';
const FRONTEND_URL = 'https://admin.printforge.test';

describe('Phase 9 W7 — StorefrontCorsPolicy (spec §9)', () => {
  type LookupMock = jest.Mock<Promise<StoreDomainLookupRow | null>, [string]>;
  type ModeMock = jest.Mock<Promise<{ mode: string; source: string }>, []>;

  let lookup: LookupMock;
  let mode: ModeMock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    lookup = jest.fn<Promise<StoreDomainLookupRow | null>, [string]>(() =>
      Promise.resolve(null),
    );
    mode = jest.fn<Promise<{ mode: string; source: string }>, []>(() =>
      Promise.resolve({ mode: 'host_resolution', source: 'row' }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makePolicy(
    nodeEnv: 'development' | 'test' | 'production' = 'test',
    platformStorefrontDomain: string | null = PLATFORM_DOMAIN,
  ): StorefrontCorsPolicy {
    const config = {
      get: (key: string) => {
        switch (key) {
          case 'frontendUrl':
            return FRONTEND_URL;
          case 'nodeEnv':
            return nodeEnv;
          case 'storefrontDomains':
            return {
              platformStorefrontDomain,
              customDomainCnameTarget: null,
            };
          default:
            throw new Error(`unexpected config key ${key}`);
        }
      },
    } as unknown as ConfigService<never, true>;
    return new StorefrontCorsPolicy(
      { getMode: mode } as unknown as StorefrontResolutionModeService,
      { lookupCachedRow: lookup } as unknown as StoreDomainResolver,
      config,
    );
  }

  function row(over: Partial<StoreDomainLookupRow> = {}): StoreDomainLookupRow {
    return {
      id: 'd1',
      hostname: 'shop.example',
      storeId: 's1',
      tenantId: 't1',
      type: 'CUSTOM',
      verificationStatus: 'VERIFIED',
      tlsStatus: 'ISSUED',
      isPrimary: true,
      primaryHostname: 'shop.example',
      ...over,
    };
  }

  // ─── legacy_single_store (S-9) ─────────────────────────────────────────

  describe("legacy_single_store mode — today's behaviour, nothing more", () => {
    beforeEach(() => {
      mode.mockResolvedValue({ mode: 'legacy_single_store', source: 'row' });
    });

    it('admits the FRONTEND_URL origin', async () => {
      expect(await makePolicy().evaluate(FRONTEND_URL)).toEqual({
        allowed: true,
        reason: 'platform_admin_origin',
      });
    });

    it('DENIES a platform subdomain (S-9 — no misrouting window)', async () => {
      expect(
        await makePolicy().evaluate(`https://shop-a.${PLATFORM_DOMAIN}`),
      ).toEqual({ allowed: false, reason: 'legacy_mode_only_frontend_url' });
    });

    it('DENIES a fully verified + issued custom origin', async () => {
      lookup.mockResolvedValue(row());
      expect(await makePolicy().evaluate('https://shop.example')).toEqual({
        allowed: false,
        reason: 'legacy_mode_only_frontend_url',
      });
    });

    it('consults neither the allow-list nor the StoreDomain table at all', async () => {
      await makePolicy().evaluate('https://shop.example');
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  // ─── host_resolution ───────────────────────────────────────────────────

  describe('host_resolution mode — the dynamic allow-list', () => {
    it('admits the platform admin origin (trailing slash / case tolerated)', async () => {
      for (const origin of [
        FRONTEND_URL,
        `${FRONTEND_URL}/`,
        FRONTEND_URL.toUpperCase(),
      ]) {
        expect((await makePolicy().evaluate(origin)).allowed).toBe(true);
      }
    });

    it('admits a one-label platform subdomain WITHOUT a database read', async () => {
      const decision = await makePolicy().evaluate(
        `https://shop-a.${PLATFORM_DOMAIN}`,
      );
      expect(decision).toEqual({ allowed: true, reason: 'platform_subdomain' });
      expect(lookup).not.toHaveBeenCalled();
    });

    it('denies a two-label platform subdomain (the wildcard covers one level)', async () => {
      expect(
        await makePolicy().evaluate(`https://a.b.${PLATFORM_DOMAIN}`),
      ).toEqual({ allowed: false, reason: 'platform_subdomain_too_deep' });
    });

    it('does not admit the platform apex itself — it falls through to the lookup', async () => {
      const decision = await makePolicy().evaluate(
        `https://${PLATFORM_DOMAIN}`,
      );
      expect(decision).toEqual({ allowed: false, reason: 'unknown_host' });
      expect(lookup).toHaveBeenCalledWith(PLATFORM_DOMAIN);
    });

    it('admits a VERIFIED + ISSUED custom origin', async () => {
      lookup.mockResolvedValue(row());
      expect(await makePolicy().evaluate('https://shop.example')).toEqual({
        allowed: true,
        reason: 'custom_domain_served',
      });
    });

    it('denies a VERIFIED custom origin whose TLS is still PENDING', async () => {
      lookup.mockResolvedValue(row({ tlsStatus: 'PENDING' as TlsStatus }));
      expect(await makePolicy().evaluate('https://shop.example')).toEqual({
        allowed: false,
        reason: 'custom_domain_not_served',
      });
    });

    it('denies a VERIFIED custom origin with a null tlsStatus (reads as PENDING)', async () => {
      lookup.mockResolvedValue(row({ tlsStatus: null }));
      expect(
        (await makePolicy().evaluate('https://shop.example')).allowed,
      ).toBe(false);
    });

    it('denies a PENDING custom origin', async () => {
      lookup.mockResolvedValue(
        row({ verificationStatus: 'PENDING' as DomainVerificationStatus }),
      );
      expect(await makePolicy().evaluate('https://shop.example')).toEqual({
        allowed: false,
        reason: 'custom_domain_not_served',
      });
    });

    it('denies a platform-REVOKED (FAILED) custom origin even with TLS issued', async () => {
      lookup.mockResolvedValue(
        row({ verificationStatus: 'FAILED' as DomainVerificationStatus }),
      );
      expect(await makePolicy().evaluate('https://shop.example')).toEqual({
        allowed: false,
        reason: 'custom_domain_not_served',
      });
    });

    it('treats a null `type` as CUSTOM — fail-closed (§3.2)', async () => {
      lookup.mockResolvedValue(
        row({ type: null, tlsStatus: 'PENDING' as TlsStatus }),
      );
      expect(
        (await makePolicy().evaluate('https://shop.example')).allowed,
      ).toBe(false);
    });

    it('admits a PLATFORM_SUBDOMAIN row regardless of its verification/TLS state', async () => {
      lookup.mockResolvedValue(
        row({
          hostname: 'legacy-platform.example',
          type: 'PLATFORM_SUBDOMAIN' as StoreDomainType,
          verificationStatus: 'PENDING' as DomainVerificationStatus,
          tlsStatus: 'ERROR' as TlsStatus,
        }),
      );
      expect(
        await makePolicy().evaluate('https://legacy-platform.example'),
      ).toEqual({ allowed: true, reason: 'platform_subdomain' });
    });

    it('denies an unknown host', async () => {
      expect(await makePolicy().evaluate('https://evil.example')).toEqual({
        allowed: false,
        reason: 'unknown_host',
      });
    });

    it.each([
      ['the literal string null', 'null'],
      ['a value with a path', 'https://shop.example/evil'],
      ['a value with a query', 'https://shop.example?a=1'],
      ['userinfo', 'https://user@shop.example'],
      ['a non-http scheme', 'file://shop.example'],
      ['a bare hostname with no scheme', 'shop.example'],
      ['an IPv6 literal', 'https://[::1]'],
      ['a single-label host', 'https://shop'],
    ])(
      'denies %s as malformed, without a database read',
      async (_l, origin) => {
        const decision = await makePolicy().evaluate(origin);
        expect(decision).toEqual({
          allowed: false,
          reason: 'malformed_origin',
        });
        expect(lookup).not.toHaveBeenCalled();
      },
    );

    it('never returns a wildcard or reflects an arbitrary origin', async () => {
      const decisions = await Promise.all(
        ['https://evil.example', '*', 'null', ''].map((o) =>
          makePolicy().evaluate(o),
        ),
      );
      // The empty string is "no Origin header" — not an allow-list entry.
      expect(decisions.map((d) => d.reason)).toEqual([
        'unknown_host',
        'malformed_origin',
        'malformed_origin',
        'no_origin',
      ]);
    });

    it('an absent Origin is not a CORS request and is never a grant', async () => {
      expect(await makePolicy().evaluate(undefined)).toEqual({
        allowed: true,
        reason: 'no_origin',
      });
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  // ─── scheme / port policy (§9) ──────────────────────────────────────────

  describe('scheme and port policy', () => {
    it('production: requires https', async () => {
      lookup.mockResolvedValue(row());
      expect(
        await makePolicy('production').evaluate('http://shop.example'),
      ).toEqual({ allowed: false, reason: 'malformed_origin' });
    });

    it('production: denies a port even on an otherwise-served host', async () => {
      lookup.mockResolvedValue(row());
      expect(
        await makePolicy('production').evaluate('https://shop.example:8443'),
      ).toEqual({ allowed: false, reason: 'port_not_allowed_in_production' });
    });

    it('non-production: allows http and a port (the dev origin)', async () => {
      lookup.mockResolvedValue(row({ hostname: 'localhost' }));
      expect(
        (await makePolicy('test').evaluate('http://shop.example:5173')).allowed,
      ).toBe(true);
    });
  });

  // ─── fail-closed on an unreadable mode (S-13 / P9-S14) ─────────────────

  describe('unreadable resolution mode', () => {
    beforeEach(() => {
      mode.mockRejectedValue(
        new StorefrontResolutionModeUnavailableException(),
      );
    });

    it('still admits the platform admin origin, so an operator can fix the flag', async () => {
      expect((await makePolicy().evaluate(FRONTEND_URL)).allowed).toBe(true);
    });

    it('denies every dynamic origin — never guesses a mode (S-13)', async () => {
      lookup.mockResolvedValue(row());
      for (const origin of [
        'https://shop.example',
        `https://shop-a.${PLATFORM_DOMAIN}`,
      ]) {
        expect(await makePolicy().evaluate(origin)).toEqual({
          allowed: false,
          reason: 'mode_unavailable',
        });
      }
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  // ─── dry-run (§9 pre-flip verification) ────────────────────────────────

  describe('evaluateAsHostResolution — the dry-run predicate', () => {
    it('gives the host_resolution verdict even while legacy mode is in force', async () => {
      mode.mockResolvedValue({ mode: 'legacy_single_store', source: 'row' });
      lookup.mockResolvedValue(row());
      const policy = makePolicy();

      expect(await policy.evaluate('https://shop.example')).toEqual({
        allowed: false,
        reason: 'legacy_mode_only_frontend_url',
      });
      expect(
        await policy.evaluateAsHostResolution('https://shop.example'),
      ).toEqual({ allowed: true, reason: 'custom_domain_served' });
    });

    it('never reads the mode at all — the verdict cannot depend on it', async () => {
      await makePolicy().evaluateAsHostResolution('https://shop.example');
      expect(mode).not.toHaveBeenCalled();
    });

    it('reports the same denials the live predicate would', async () => {
      const policy = makePolicy();
      expect(
        await policy.evaluateAsHostResolution(`https://a.b.${PLATFORM_DOMAIN}`),
      ).toEqual({ allowed: false, reason: 'platform_subdomain_too_deep' });
      expect(await policy.evaluateAsHostResolution('nonsense')).toEqual({
        allowed: false,
        reason: 'malformed_origin',
      });
    });
  });

  // ─── configuration edge case ───────────────────────────────────────────

  it('with PLATFORM_STOREFRONT_DOMAIN unset, no host is admitted by pattern', async () => {
    const policy = makePolicy('test', null);
    expect(await policy.evaluate(`https://shop-a.${PLATFORM_DOMAIN}`)).toEqual({
      allowed: false,
      reason: 'unknown_host',
    });
    expect(lookup).toHaveBeenCalledWith(`shop-a.${PLATFORM_DOMAIN}`);
  });
});
