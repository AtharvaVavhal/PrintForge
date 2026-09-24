import { TlsStatus } from '@prisma/client';
import {
  DomainCertificateState,
  DomainHostingError,
  mapCertificateToTlsStatus,
} from './domain-hosting-provider';
import { FakeDomainHostingProvider } from './fake-domain-hosting.provider';
import { UnprovisionedDomainHostingProvider } from './unprovisioned-domain-hosting.provider';

/**
 * Phase 9 W6 — the hosting seam's two load-bearing behaviours (spec §7.1,
 * §7.2): the `tlsStatus` mapping every caller shares, and the guarantee that
 * neither bound implementation can ever invent an `ISSUED` certificate, since
 * `ISSUED` is half of the §4.3 serving gate for a `CUSTOM` domain.
 */
describe('Phase 9 W6 — DomainHostingProvider seam (spec §7)', () => {
  describe('mapCertificateToTlsStatus (§7.2)', () => {
    it('configured + issued → ISSUED (the only serveable combination)', () => {
      expect(
        mapCertificateToTlsStatus({
          configured: true,
          certificate: 'issued',
          cnameTarget: null,
        }),
      ).toBe(TlsStatus.ISSUED);
    });

    it('issued but NOT configured → PENDING, never ISSUED (fail-closed)', () => {
      expect(
        mapCertificateToTlsStatus({
          configured: false,
          certificate: 'issued',
          cnameTarget: null,
        }),
      ).toBe(TlsStatus.PENDING);
    });

    it('certificate error → ERROR, regardless of configured', () => {
      for (const configured of [true, false]) {
        expect(
          mapCertificateToTlsStatus({
            configured,
            certificate: 'error',
            cnameTarget: null,
          }),
        ).toBe(TlsStatus.ERROR);
      }
    });

    it('pending → PENDING, regardless of configured', () => {
      for (const configured of [true, false]) {
        expect(
          mapCertificateToTlsStatus({
            configured,
            certificate: 'pending',
            cnameTarget: null,
          }),
        ).toBe(TlsStatus.PENDING);
      }
    });

    it('every certificate state maps to a TlsStatus (no unmapped value)', () => {
      const states: DomainCertificateState[] = ['pending', 'issued', 'error'];
      for (const certificate of states) {
        expect(Object.values(TlsStatus) as string[]).toContain(
          mapCertificateToTlsStatus({
            configured: true,
            certificate,
            cnameTarget: null,
          }),
        );
      }
    });
  });

  describe('FakeDomainHostingProvider (dev/test)', () => {
    let provider: FakeDomainHostingProvider;

    beforeEach(() => {
      provider = new FakeDomainHostingProvider();
    });

    it('attaching a domain reports it configured but NOT issued', async () => {
      const status = await provider.addDomain('shop.example');
      expect(status.configured).toBe(true);
      expect(status.certificate).toBe('pending');
      expect(mapCertificateToTlsStatus(status)).toBe(TlsStatus.PENDING);
    });

    it('only an explicit markIssued() produces ISSUED', async () => {
      await provider.addDomain('shop.example');
      provider.markIssued('shop.example');
      expect(
        mapCertificateToTlsStatus(
          await provider.getDomainStatus('shop.example'),
        ),
      ).toBe(TlsStatus.ISSUED);
    });

    it('an unknown hostname is not configured', async () => {
      const status = await provider.getDomainStatus('never-added.example');
      expect(status.configured).toBe(false);
      expect(mapCertificateToTlsStatus(status)).toBe(TlsStatus.PENDING);
    });

    it('removeDomain detaches and is idempotent for an unattached host', async () => {
      await provider.addDomain('shop.example');
      await provider.removeDomain('shop.example');
      expect(provider.isAttached('shop.example')).toBe(false);
      await expect(
        provider.removeDomain('shop.example'),
      ).resolves.toBeUndefined();
    });

    it('failFor makes every operation reject with DomainHostingError', async () => {
      provider.failFor('broken.example');
      await expect(provider.addDomain('broken.example')).rejects.toBeInstanceOf(
        DomainHostingError,
      );
      await expect(
        provider.getDomainStatus('broken.example'),
      ).rejects.toBeInstanceOf(DomainHostingError);
      await expect(
        provider.removeDomain('broken.example'),
      ).rejects.toBeInstanceOf(DomainHostingError);
    });

    it('records every call in order (what the e2e assertions observe)', async () => {
      await provider.addDomain('a.example');
      await provider.getDomainStatus('a.example');
      await provider.removeDomain('a.example');
      expect(provider.calls).toEqual([
        { op: 'add', hostname: 'a.example' },
        { op: 'status', hostname: 'a.example' },
        { op: 'remove', hostname: 'a.example' },
      ]);
    });
  });

  describe('UnprovisionedDomainHostingProvider (production binding)', () => {
    let provider: UnprovisionedDomainHostingProvider;

    beforeEach(() => {
      provider = new UnprovisionedDomainHostingProvider();
      jest
        .spyOn(provider['logger'], 'warn')
        .mockImplementation(() => undefined);
      jest.spyOn(provider['logger'], 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('never reports a domain as configured or issued — so TLS stays PENDING', async () => {
      for (const status of [
        await provider.addDomain('shop.example'),
        await provider.getDomainStatus('shop.example'),
      ]) {
        expect(status.configured).toBe(false);
        expect(status.certificate).toBe('pending');
        expect(mapCertificateToTlsStatus(status)).toBe(TlsStatus.PENDING);
      }
    });

    it('removeDomain succeeds — a missing integration must not block a merchant from removing their own domain', async () => {
      await expect(
        provider.removeDomain('shop.example'),
      ).resolves.toBeUndefined();
    });

    it('cannot be coaxed into ISSUED by repeated attachment', async () => {
      await provider.addDomain('shop.example');
      await provider.addDomain('shop.example');
      expect(
        mapCertificateToTlsStatus(
          await provider.getDomainStatus('shop.example'),
        ),
      ).toBe(TlsStatus.PENDING);
    });
  });
});
