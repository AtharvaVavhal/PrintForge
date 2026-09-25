import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DOMAIN_HOSTING_PROVIDER } from './domain-hosting-provider';
import { DomainHostingModule } from './domain-hosting.module';
import { FakeDomainHostingProvider } from './fake-domain-hosting.provider';
import { UnprovisionedDomainHostingProvider } from './unprovisioned-domain-hosting.provider';
import { VercelDomainHostingProvider } from './vercel-domain-hosting.provider';

/**
 * Phase 9 — which hosting provider the DI seam binds (spec §7.1
 * "DI-wired by environment"). The selection rule is security-relevant: bind
 * the fake in production and a hostname with no certificate would look
 * serveable; bind the real adapter in test and the suite would hit Vercel.
 */
describe('Phase 9 — DomainHostingModule provider selection (spec §7.1)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  /**
   * Mirrors how the real app supplies `ConfigService`: globally, via
   * `ConfigModule.forRoot({ isGlobal: true })` in `app.module.ts`. Without a
   * global provider the module's own factory cannot resolve it, so this is the
   * faithful harness rather than a convenience.
   */
  async function resolve(
    nodeEnv: string,
    vercel: {
      apiToken: string | null;
      projectId: string | null;
      teamId: string | null;
    },
  ): Promise<unknown> {
    const configService = {
      get: (key: string) => (key === 'nodeEnv' ? nodeEnv : vercel),
    } as unknown as ConfigService;

    @Global()
    @Module({
      providers: [{ provide: ConfigService, useValue: configService }],
      exports: [ConfigService],
    })
    class TestConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, DomainHostingModule],
    }).compile();
    return moduleRef.get(DOMAIN_HOSTING_PROVIDER);
  }

  const CONFIGURED = {
    apiToken: 'token-not-a-real-secret',
    projectId: 'prj_x',
    teamId: null,
  };
  const ABSENT = { apiToken: null, projectId: null, teamId: null };

  it.each(['test', 'development'])(
    'binds the FAKE provider in %s, even with Vercel credentials present',
    async (env) => {
      expect(await resolve(env, CONFIGURED)).toBeInstanceOf(
        FakeDomainHostingProvider,
      );
    },
  );

  it('binds the REAL Vercel adapter in production when token + project id are set', async () => {
    expect(await resolve('production', CONFIGURED)).toBeInstanceOf(
      VercelDomainHostingProvider,
    );
  });

  it('binds the non-issuing fallback in production when credentials are absent', async () => {
    expect(await resolve('production', ABSENT)).toBeInstanceOf(
      UnprovisionedDomainHostingProvider,
    );
  });

  it.each([
    ['token only', { apiToken: 'tok', projectId: null, teamId: null }],
    ['project id only', { apiToken: null, projectId: 'prj_x', teamId: null }],
  ])(
    'falls back in production on PARTIAL configuration (%s) — never a half-configured adapter',
    async (_label, vercel) => {
      expect(await resolve('production', vercel)).toBeInstanceOf(
        UnprovisionedDomainHostingProvider,
      );
    },
  );

  it('logs a warning when production falls back, so the gap is visible', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await resolve('production', ABSENT);
    expect(warn.mock.calls.flat().join(' ')).toMatch(
      /VERCEL_API_TOKEN \/ VERCEL_PROJECT_ID are not configured/,
    );
  });

  it('never logs the token when the real adapter is selected', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await resolve('production', CONFIGURED);
    expect(log.mock.calls.flat().join(' ')).not.toContain(CONFIGURED.apiToken);
  });

  it('teamId alone does not make the adapter eligible', async () => {
    expect(
      await resolve('production', {
        apiToken: null,
        projectId: null,
        teamId: 'team_x',
      }),
    ).toBeInstanceOf(UnprovisionedDomainHostingProvider);
  });
});
