import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import { DOMAIN_HOSTING_PROVIDER } from './domain-hosting-provider';
import { FakeDomainHostingProvider } from './fake-domain-hosting.provider';
import { UnprovisionedDomainHostingProvider } from './unprovisioned-domain-hosting.provider';

/**
 * Phase 9 W6 — binds the one `DomainHostingProvider` for the process
 * ("DI-wired by environment", spec §7.1). Controller-less and exported, so
 * both control planes consume the identical seam without importing each
 * other (the same reason `StoreDomainVerificationModule` exists).
 *
 * Production → `UnprovisionedDomainHostingProvider` (honest, fail-closed).
 * Everything else → `FakeDomainHostingProvider` (in-memory, test-controlled).
 * The real `VercelDomainHostingProvider` is a later wave: it binds to this
 * same token and nothing else in the codebase changes.
 */
@Module({
  providers: [
    {
      provide: DOMAIN_HOSTING_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const nodeEnv = configService.get('nodeEnv', { infer: true });
        if (nodeEnv === 'production') {
          new Logger('DomainHostingModule').warn(
            'no real DomainHostingProvider is implemented yet — custom-domain TLS will never reach ISSUED and custom domains will not be served (Phase 9 §7.1)',
          );
          return new UnprovisionedDomainHostingProvider();
        }
        return new FakeDomainHostingProvider();
      },
    },
  ],
  exports: [DOMAIN_HOSTING_PROVIDER],
})
export class DomainHostingModule {}
