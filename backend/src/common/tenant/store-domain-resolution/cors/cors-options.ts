import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { StorefrontCorsPolicy } from './storefront-cors.policy';

/**
 * Phase 9 W7 — the exact `enableCors` options the app runs with (spec §9),
 * in one place so `main.ts` and the e2e harness cannot drift: a suite that
 * asserts which origins are admitted has to exercise the SAME wiring
 * production uses, not a re-implementation of it.
 *
 * `credentials: true` is retained from the pre-Phase-9 configuration (§23).
 * The callback form is required because the verdict is async (the kill-switch
 * read plus the cached `StoreDomain` lookup). A rejected promise DENIES: the
 * error is swallowed into `allow = false` rather than propagated, because
 * throwing here would surface as a 500 on an otherwise valid request and —
 * worse — an unhandled rejection path is exactly where a predicate
 * accidentally falls open.
 *
 * `cors` echoes the request's own `Origin` when the predicate returns true
 * and adds `Vary: Origin`; it never emits `*`, and a denial is communicated
 * only by the ABSENCE of `Access-Control-Allow-Origin`.
 */
export function buildCorsOptions(policy: StorefrontCorsPolicy): CorsOptions {
  return {
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      policy
        .evaluate(requestOrigin)
        .then((decision) => callback(null, decision.allowed))
        .catch(() => callback(null, false));
    },
    credentials: true,
  };
}
