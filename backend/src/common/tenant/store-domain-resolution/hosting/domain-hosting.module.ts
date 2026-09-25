import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import { DOMAIN_HOSTING_PROVIDER } from './domain-hosting-provider';
import { FakeDomainHostingProvider } from './fake-domain-hosting.provider';
import { UnprovisionedDomainHostingProvider } from './unprovisioned-domain-hosting.provider';
import { VercelDomainHostingProvider } from './vercel-domain-hosting.provider';

/**
 * Phase 9 — binds the one `DomainHostingProvider` for the process
 * ("DI-wired by environment", spec §7.1). Controller-less and exported, so
 * both control planes consume the identical seam without importing each
 * other (the same reason `StoreDomainVerificationModule` exists).
 *
 * Selection, in order:
 *
 *   non-production            -> `FakeDomainHostingProvider`
 *   production + VERCEL_* set -> `VercelDomainHostingProvider` (⚖️ P9-D3)
 *   production, not configured-> `UnprovisionedDomainHostingProvider`
 *
 * Non-production ALWAYS gets the fake, even when Vercel credentials happen to
 * be present: no test run may reach the real API, and the e2e suites assert
 * against the fake's own control surface.
 *
 * The unprovisioned fallback is retained deliberately, not as dead code.
 * §17.1 item 4 (the `VERCEL_*` names on Render) is a **W8 gate**, so
 * production can legitimately boot before ops has provisioned the token; a
 * hard failure there would take the whole API down over a feature that is not
 * yet cut over. The fallback never reports a certificate as issued, so a
 * verified custom domain stays unserved by the §4.3 gate — the fail-closed
 * outcome — and it logs on every call. `env.validation.ts` additionally makes
 * the credentials a hard production requirement the moment
 * `PLATFORM_STOREFRONT_DOMAIN` is set, which is the point at which the
 * fallback would become a real gap rather than a benign one.
 */
@Module({
  providers: [
    {
      provide: DOMAIN_HOSTING_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const logger = new Logger('DomainHostingModule');
        const nodeEnv = configService.get('nodeEnv', { infer: true });
        if (nodeEnv !== 'production') {
          return new FakeDomainHostingProvider();
        }
        const vercel = configService.get('vercel', { infer: true });
        if (vercel.apiToken !== null && vercel.projectId !== null) {
          logger.log(
            'storefront domain hosting: Vercel adapter active (project id and token configured)',
          );
          return new VercelDomainHostingProvider({
            apiToken: vercel.apiToken,
            projectId: vercel.projectId,
            teamId: vercel.teamId,
          });
        }
        logger.warn(
          'storefront domain hosting: VERCEL_API_TOKEN / VERCEL_PROJECT_ID are not configured — custom-domain TLS will never reach ISSUED and custom domains will not be served (Phase 9 §7.1/§17.1 item 4)',
        );
        return new UnprovisionedDomainHostingProvider();
      },
    },
  ],
  exports: [DOMAIN_HOSTING_PROVIDER],
})
export class DomainHostingModule {}
