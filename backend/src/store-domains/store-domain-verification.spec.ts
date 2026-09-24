import {
  DomainVerificationMethod,
  DomainVerificationStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  DnsLookupError,
  DOMAIN_DNS_RESOLVER,
  DNS_LOOKUP_TIMEOUT_MS,
  DomainDnsResolver,
} from './dns/domain-dns-resolver';
import { StoreDomainVerificationCheck } from './store-domain-verification-check.service';
import {
  evaluateCname,
  evaluateTxt,
  normaliseDnsTarget,
  txtRecordName,
  VERIFICATION_TXT_LABEL,
  verificationInstructions,
} from './store-domain-verification';

/**
 * Phase 9 W5 — unit half of spec §14.2 (`store-domain-verification.spec.ts`,
 * "DNS mocked"): the two ratified verification methods' rules (⚖️ P9-D2 —
 * `DNS_TXT` and `CNAME`, nothing else), the reason codes S-6 retains, and the
 * G-5 enum-set guard. The state machine, audit rows, authorization and tenant
 * isolation are proven end-to-end against real Postgres and the real guard
 * chain in `test/e2e/store-domain-verification.e2e-spec.ts`.
 */
describe('Phase 9 W5 — store-domain verification rules (spec §6.3)', () => {
  describe('G-5 / P9-D2 — the verification-status enum set is untouched', () => {
    it('DomainVerificationStatus is exactly {PENDING, VERIFIED, FAILED} — no VERIFYING', () => {
      expect(Object.keys(DomainVerificationStatus).sort()).toEqual([
        'FAILED',
        'PENDING',
        'VERIFIED',
      ]);
      expect(
        (DomainVerificationStatus as Record<string, string>).VERIFYING,
      ).toBeUndefined();
    });

    it('DomainVerificationMethod is exactly the two P9-D2-ratified methods', () => {
      expect(Object.keys(DomainVerificationMethod).sort()).toEqual([
        'CNAME',
        'DNS_TXT',
      ]);
    });
  });

  describe('DNS_TXT', () => {
    it('looks for the token at the _printforge-verify label of the hostname', () => {
      expect(VERIFICATION_TXT_LABEL).toBe('_printforge-verify');
      expect(txtRecordName('shop.example')).toBe(
        '_printforge-verify.shop.example',
      );
    });

    it('passes when any TXT record equals the token', () => {
      expect(evaluateTxt(['other-value', 'tok-abc'], 'tok-abc')).toEqual({
        passed: true,
      });
    });

    it('tolerates surrounding whitespace in the published record', () => {
      expect(evaluateTxt(['  tok-abc  '], 'tok-abc')).toEqual({ passed: true });
    });

    it('fails with TXT_RECORD_NOT_FOUND when there is no record at all', () => {
      expect(evaluateTxt([], 'tok-abc')).toEqual({
        passed: false,
        reason: 'TXT_RECORD_NOT_FOUND',
      });
    });

    it('fails with TXT_VALUE_MISMATCH when a record exists but differs', () => {
      expect(evaluateTxt(['tok-wrong'], 'tok-abc')).toEqual({
        passed: false,
        reason: 'TXT_VALUE_MISMATCH',
      });
    });
  });

  describe('CNAME', () => {
    it('normalises case and the trailing dot on both sides', () => {
      expect(normaliseDnsTarget('CNAME.Vercel-DNS.COM.')).toBe(
        'cname.vercel-dns.com',
      );
      expect(
        evaluateCname(['CNAME.Vercel-DNS.com.'], 'cname.vercel-dns.com'),
      ).toEqual({ passed: true });
    });

    it('fails with CNAME_RECORD_NOT_FOUND when no CNAME exists', () => {
      expect(evaluateCname([], 'cname.vercel-dns.com')).toEqual({
        passed: false,
        reason: 'CNAME_RECORD_NOT_FOUND',
      });
    });

    it('fails with CNAME_TARGET_MISMATCH when it points elsewhere', () => {
      expect(
        evaluateCname(['some-other-host.example'], 'cname.vercel-dns.com'),
      ).toEqual({ passed: false, reason: 'CNAME_TARGET_MISMATCH' });
    });
  });

  describe('merchant instructions returned with the token (spec §6.1)', () => {
    it('DNS_TXT names the record and the token value', () => {
      const out = verificationInstructions(
        'shop.example',
        DomainVerificationMethod.DNS_TXT,
        'tok-abc',
        null,
      );
      expect(out.record).toBe('_printforge-verify.shop.example');
      expect(out.value).toBe('tok-abc');
      expect(out.text).toContain('TXT');
    });

    it('CNAME names the hostname and the configured provider target', () => {
      const out = verificationInstructions(
        'shop.example',
        DomainVerificationMethod.CNAME,
        'tok-abc',
        'cname.vercel-dns.com',
      );
      expect(out.record).toBe('shop.example');
      expect(out.value).toBe('cname.vercel-dns.com');
      // The token is a TXT-only secret — never printed in CNAME instructions.
      expect(out.text).not.toContain('tok-abc');
    });
  });

  describe('StoreDomainVerificationCheck (the one shared check, spec §6.3)', () => {
    function makeCheck(
      dns: Partial<DomainDnsResolver>,
      cnameTarget: string | null,
    ): StoreDomainVerificationCheck {
      const resolver: DomainDnsResolver = {
        resolveTxt: () => Promise.resolve([]),
        resolveCname: () => Promise.resolve([]),
        ...dns,
      };
      const config = {
        get: () => ({
          platformStorefrontDomain: 'stores.printforge.test',
          customDomainCnameTarget: cnameTarget,
        }),
      };
      return new StoreDomainVerificationCheck(
        resolver,
        config as unknown as ConfigService<never, true>,
      );
    }

    it('is bounded by the ratified 5 s timeout', () => {
      expect(DNS_LOOKUP_TIMEOUT_MS).toBe(5_000);
    });

    it('resolves the TXT name derived from the hostname, not the hostname itself', async () => {
      const seen: string[] = [];
      const check = makeCheck(
        {
          resolveTxt: (name) => {
            seen.push(name);
            return Promise.resolve(['tok-abc']);
          },
        },
        null,
      );
      const outcome = await check.check({
        hostname: 'shop.example',
        verificationMethod: DomainVerificationMethod.DNS_TXT,
        verificationToken: 'tok-abc',
      });
      expect(outcome).toEqual({ passed: true });
      expect(seen).toEqual(['_printforge-verify.shop.example']);
    });

    it('maps a resolver timeout to DNS_TIMEOUT (S-6 reason code)', async () => {
      const check = makeCheck(
        {
          resolveTxt: () =>
            Promise.reject(new DnsLookupError('timeout', 'timed out')),
        },
        null,
      );
      expect(
        await check.check({
          hostname: 'shop.example',
          verificationMethod: DomainVerificationMethod.DNS_TXT,
          verificationToken: 'tok-abc',
        }),
      ).toEqual({ passed: false, reason: 'DNS_TIMEOUT' });
    });

    it('maps any other resolver failure to DNS_ERROR', async () => {
      const check = makeCheck(
        {
          resolveTxt: () =>
            Promise.reject(new DnsLookupError('error', 'servfail')),
        },
        null,
      );
      expect(
        await check.check({
          hostname: 'shop.example',
          verificationMethod: DomainVerificationMethod.DNS_TXT,
          verificationToken: 'tok-abc',
        }),
      ).toEqual({ passed: false, reason: 'DNS_ERROR' });
    });

    it('fails CNAME verification closed when no provider target is configured', async () => {
      let called = false;
      const check = makeCheck(
        {
          resolveCname: () => {
            called = true;
            return Promise.resolve(['cname.vercel-dns.com']);
          },
        },
        null,
      );
      expect(
        await check.check({
          hostname: 'shop.example',
          verificationMethod: DomainVerificationMethod.CNAME,
          verificationToken: 'tok-abc',
        }),
      ).toEqual({ passed: false, reason: 'CNAME_TARGET_NOT_CONFIGURED' });
      expect(called).toBe(false);
    });

    it('treats a null verificationMethod as DNS_TXT (fail-safe: no token, no pass)', async () => {
      const check = makeCheck(
        { resolveTxt: () => Promise.resolve(['something']) },
        null,
      );
      expect(
        await check.check({
          hostname: 'shop.example',
          verificationMethod: null,
          verificationToken: null,
        }),
      ).toEqual({ passed: false, reason: 'TXT_VALUE_MISMATCH' });
    });

    it('exposes the DI token the e2e suite swaps the resolver through', () => {
      expect(typeof DOMAIN_DNS_RESOLVER).toBe('symbol');
    });
  });
});
