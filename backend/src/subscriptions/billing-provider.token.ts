/**
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2 Part G) — the explicit DI
 * injection token for `BillingProvider`. A plain interface has no runtime
 * value NestJS's DI container can key a binding on, so every consumer of
 * `BillingProvider` injects this token (`@Inject(BILLING_PROVIDER)`)
 * rather than the interface type itself — the same reason any NestJS app
 * needs a custom provider token for an interface-shaped dependency.
 *
 * `SubscriptionModule` binds this token to `FakeBillingProvider` today
 * (see that module's own comment) — the ONLY place in the entire
 * codebase that binding exists. P7-D2 Part G is explicit that this bind
 * is NOT a production billing-provider selection: it exists solely to
 * make Stage 2's vendor-independent orchestration executable. Replacing
 * `FakeBillingProvider` with a real vendor adapter, once one is chosen
 * (P7-D1 Part G, still OPEN), means changing exactly one `useClass` line
 * in `subscription.module.ts` — nothing that injects this token needs to
 * change at all.
 */
export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
