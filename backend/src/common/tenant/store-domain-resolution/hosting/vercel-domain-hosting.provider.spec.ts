import { Logger } from '@nestjs/common';
import { TlsStatus } from '@prisma/client';
import {
  DomainHostingError,
  mapCertificateToTlsStatus,
} from './domain-hosting-provider';
import {
  VERCEL_API_TIMEOUT_MS,
  VercelDomainHostingProvider,
} from './vercel-domain-hosting.provider';

/**
 * Phase 9 — the Vercel adapter (spec §7.1–§7.3; ⚖️ P9-D3, 🔎 S-8). `fetch` is
 * stubbed for every case: no test may reach the real Vercel API.
 *
 * The assertions that matter most are the fail-closed ones. `ISSUED` is half of
 * the §4.3 serving gate, so every ambiguous or failed provider answer must map
 * to `PENDING` — an adapter that optimistically reported `issued` would let a
 * hostname with no certificate be served.
 */
const TOKEN = 'test-token-not-a-real-secret';
const PROJECT = 'prj_test';
const HOST = 'shop.example';

interface StubCall {
  method: string;
  url: string;
  body?: unknown;
  headers: Record<string, string>;
}

describe('Phase 9 — VercelDomainHostingProvider (spec §7)', () => {
  let calls: StubCall[];
  let fetchSpy: jest.SpyInstance;

  /** Queue of responses, consumed in order. */
  function stubFetch(
    responses: ({ status: number; body?: unknown } | Error)[],
  ): void {
    let i = 0;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(((
      input: string,
      init?: RequestInit,
    ) => {
      calls.push({
        method: init?.method ?? 'GET',
        url: String(input),
        body:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as unknown)
            : undefined,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      const next = responses[Math.min(i++, responses.length - 1)];
      if (next instanceof Error) {
        return Promise.reject(next);
      }
      return Promise.resolve({
        ok: next.status >= 200 && next.status < 300,
        status: next.status,
        json: () =>
          next.body === undefined
            ? Promise.reject(new Error('no body'))
            : Promise.resolve(next.body),
      } as Response);
    }) as unknown as typeof fetch);
  }

  function makeProvider(teamId: string | null = null) {
    return new VercelDomainHostingProvider({
      apiToken: TOKEN,
      projectId: PROJECT,
      teamId,
    });
  }

  beforeEach(() => {
    calls = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── addDomain ─────────────────────────────────────────────────────────

  describe('addDomain', () => {
    it('POSTs the hostname to the project, then reads the resulting state', async () => {
      stubFetch([
        { status: 200, body: { name: HOST } },
        { status: 200, body: { name: HOST, verified: true } },
        { status: 200, body: { misconfigured: false } },
      ]);
      const status = await makeProvider().addDomain(HOST);

      expect(calls[0].method).toBe('POST');
      expect(calls[0].url).toContain(`/v10/projects/${PROJECT}/domains`);
      expect(calls[0].body).toEqual({ name: HOST });
      expect(status).toEqual({
        configured: true,
        certificate: 'issued',
        cnameTarget: null,
      });
    });

    it('treats an already-attached domain (409) as success, not an error', async () => {
      stubFetch([
        { status: 409, body: { error: { code: 'domain_already_in_use' } } },
        { status: 200, body: { name: HOST, verified: true } },
        { status: 200, body: { misconfigured: false } },
      ]);
      await expect(makeProvider().addDomain(HOST)).resolves.toMatchObject({
        configured: true,
      });
    });

    it('throws DomainHostingError on any other rejection', async () => {
      stubFetch([{ status: 403, body: { error: {} } }]);
      await expect(makeProvider().addDomain(HOST)).rejects.toBeInstanceOf(
        DomainHostingError,
      );
    });
  });

  // ─── getDomainStatus / tlsStatus mapping ───────────────────────────────

  describe('getDomainStatus mapping (§7.2)', () => {
    it('verified + not misconfigured → ISSUED (the only serveable state)', async () => {
      stubFetch([
        { status: 200, body: { verified: true } },
        { status: 200, body: { misconfigured: false } },
      ]);
      const status = await makeProvider().getDomainStatus(HOST);
      expect(status).toMatchObject({ configured: true, certificate: 'issued' });
      expect(mapCertificateToTlsStatus(status)).toBe(TlsStatus.ISSUED);
    });

    it('verified but MISCONFIGURED DNS → PENDING, never ISSUED', async () => {
      stubFetch([
        { status: 200, body: { verified: true } },
        { status: 200, body: { misconfigured: true } },
      ]);
      const status = await makeProvider().getDomainStatus(HOST);
      expect(status.certificate).toBe('pending');
      expect(mapCertificateToTlsStatus(status)).toBe(TlsStatus.PENDING);
    });

    it('attached but NOT verified → PENDING', async () => {
      stubFetch([
        { status: 200, body: { verified: false } },
        { status: 200, body: { misconfigured: false } },
      ]);
      expect(
        mapCertificateToTlsStatus(await makeProvider().getDomainStatus(HOST)),
      ).toBe(TlsStatus.PENDING);
    });

    it('a 404 project-domain is reported unconfigured rather than thrown', async () => {
      stubFetch([{ status: 404, body: { error: {} } }]);
      const status = await makeProvider().getDomainStatus(HOST);
      expect(status).toEqual({
        configured: false,
        certificate: 'pending',
        cnameTarget: null,
      });
    });

    it('a failing CONFIG read degrades to PENDING instead of failing the call', async () => {
      stubFetch([
        { status: 200, body: { verified: true } },
        { status: 500, body: { error: {} } },
      ]);
      const status = await makeProvider().getDomainStatus(HOST);
      expect(status.configured).toBe(false);
      expect(status.certificate).toBe('pending');
    });

    it('an unparseable body is treated as no data, still fail-closed', async () => {
      stubFetch([
        { status: 200 }, // json() rejects
        { status: 200, body: { misconfigured: false } },
      ]);
      expect(
        mapCertificateToTlsStatus(await makeProvider().getDomainStatus(HOST)),
      ).toBe(TlsStatus.PENDING);
    });

    it('surfaces a recommended CNAME when Vercel supplies one (informational)', async () => {
      stubFetch([
        { status: 200, body: { verified: true } },
        {
          status: 200,
          body: {
            misconfigured: false,
            recommendedCNAME: 'cname.vercel-dns.com',
          },
        },
      ]);
      expect((await makeProvider().getDomainStatus(HOST)).cnameTarget).toBe(
        'cname.vercel-dns.com',
      );
    });

    it('throws on a non-404 project-domain failure', async () => {
      stubFetch([{ status: 500, body: { error: {} } }]);
      await expect(makeProvider().getDomainStatus(HOST)).rejects.toBeInstanceOf(
        DomainHostingError,
      );
    });
  });

  // ─── removeDomain ──────────────────────────────────────────────────────

  describe('removeDomain', () => {
    it('DELETEs the project domain', async () => {
      stubFetch([{ status: 200, body: {} }]);
      await makeProvider().removeDomain(HOST);
      expect(calls[0].method).toBe('DELETE');
      expect(calls[0].url).toContain(`/v9/projects/${PROJECT}/domains/${HOST}`);
    });

    it('is idempotent — a 404 is a success', async () => {
      stubFetch([{ status: 404, body: { error: {} } }]);
      await expect(makeProvider().removeDomain(HOST)).resolves.toBeUndefined();
    });

    it('throws on any other failure, so a removal is never silently lost', async () => {
      stubFetch([{ status: 500, body: { error: {} } }]);
      await expect(makeProvider().removeDomain(HOST)).rejects.toBeInstanceOf(
        DomainHostingError,
      );
    });
  });

  // ─── transport, auth, secret hygiene ───────────────────────────────────

  describe('transport and secret hygiene', () => {
    it('sends the token as a bearer header and bounds the call', async () => {
      stubFetch([{ status: 404, body: {} }]);
      await makeProvider().getDomainStatus(HOST);
      expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(VERCEL_API_TIMEOUT_MS).toBe(10_000);
    });

    it('appends teamId only when configured', async () => {
      stubFetch([{ status: 404, body: {} }]);
      await makeProvider('team_abc').getDomainStatus(HOST);
      expect(calls[0].url).toContain('teamId=team_abc');

      calls = [];
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      stubFetch([{ status: 404, body: {} }]);
      await makeProvider(null).getDomainStatus(HOST);
      expect(calls[0].url).not.toContain('teamId');
    });

    it('a network failure becomes DomainHostingError and never leaks the token or URL', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      stubFetch([Object.assign(new Error('boom'), { name: 'TimeoutError' })]);

      await expect(makeProvider().getDomainStatus(HOST)).rejects.toBeInstanceOf(
        DomainHostingError,
      );

      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).toContain('TimeoutError');
      expect(logged).not.toContain(TOKEN);
      expect(logged).not.toContain('api.vercel.com');
      expect(logged).not.toContain(PROJECT);
    });

    it('never includes the token in a thrown error message', async () => {
      stubFetch([{ status: 401, body: { error: {} } }]);
      await expect(makeProvider().getDomainStatus(HOST)).rejects.toThrow(
        /HTTP 401/,
      );
      await expect(makeProvider().getDomainStatus(HOST)).rejects.not.toThrow(
        new RegExp(TOKEN),
      );
    });

    it('does not contact the network when fetch is stubbed (guard on the guard)', async () => {
      stubFetch([{ status: 404, body: {} }]);
      await makeProvider().getDomainStatus(HOST);
      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
