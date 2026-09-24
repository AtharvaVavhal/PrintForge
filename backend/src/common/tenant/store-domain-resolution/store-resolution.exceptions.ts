import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Phase 9 W3 — the two client-visible outcomes of the §4.3 pipeline.
 *
 * `StoreNotFoundException` covers BOTH `STORE_NOT_FOUND` (no `StoreDomain`
 * row) and `NOT_SERVED` (a `CUSTOM` row that is not yet `VERIFIED` +
 * `ISSUED`) with a byte-identical, generic body (spec S-4 / §15 SECURITY
 * IMPACT): an unknown or unverified host must not be able to learn whether
 * the hostname is registered in any state. It is also the outcome for an
 * absent or malformed `Origin` (§4.1.3) — no store scope can be derived, so
 * there is no store.
 *
 * `StoreUnavailableException` covers every `STORE_UNAVAILABLE(...)` reason
 * (store not ACTIVE, tenant not ACTIVE, subscription EXPIRED) with ONE
 * body; the reason is logged server-side with the tenant id, never
 * exposed (§4.3). Distinct status from not-found because "store status
 * and subscription status are different facts" (§15).
 */
export class StoreNotFoundException extends NotFoundException {
  constructor() {
    super('Store not found');
  }
}

export class StoreUnavailableException extends ServiceUnavailableException {
  constructor() {
    super('This store is currently unavailable');
  }
}
