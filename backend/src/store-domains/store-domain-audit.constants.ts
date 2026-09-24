/**
 * `TenantAuditLog` action names for the merchant store-domain surface (spec
 * §6.1 / §6.3). In their own dependency-free file rather than on
 * `StoreDomainsService` because the platform control plane needs to READ the
 * `verification_failed` action (S-6 retention point 2, surfaced by
 * `/platform/domains/:id`) — and `platform-domains.service.ts` importing the
 * merchant SERVICE just to reach a string constant would couple the two
 * control planes at the file level for no reason (Master Plan §11).
 */
export const STORE_DOMAIN_AUDIT = {
  added: 'store_domain.added',
  verified: 'store_domain.verified',
  verificationFailed: 'store_domain.verification_failed',
  verifyRefusedRevoked: 'store_domain.verify_refused_revoked',
  // Phase 9 W6 (spec §6.1)
  primaryChanged: 'store_domain.primary_changed',
  removed: 'store_domain.removed',
  tlsRefreshed: 'store_domain.tls_refreshed',
} as const;
