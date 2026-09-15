import { PaymentAccountStatus } from '@prisma/client';

/**
 * PaymentAccount.status compare-and-swap transition table — P8-3
 * architecture spec §4. A transition not listed here must be rejected
 * (409), not silently allowed. Every transition is applied as
 * `UPDATE payment_accounts SET status=$to WHERE id=$id AND status IN
 * ($allowed_from)` — same CAS discipline `ORDER_STATE_TRANSITIONS`
 * (`orders/state-machine/order-state-machine.ts`) already establishes for
 * this codebase.
 *
 * No hard delete — `DISABLED` is terminal-but-reversible (invariant 19).
 * `PENDING -> DISABLED` covers an abandoned/administratively-rejected
 * setup before ever going live; `DISABLED -> ACTIVE` covers a simple
 * re-enable with the same, still-valid stored credentials. The
 * credential-replacement path (`DISABLED -> PENDING`, re-entering
 * suspected-bad credentials) is deliberately NOT included in this stage —
 * no credential-attachment flow exists yet (P8-4 scope: schema + lifecycle
 * only), so there is nothing that would ever legitimately drive that edge
 * today; a later P8 stage can add it alongside the credential-attachment
 * work itself, exactly the same "keep the state machine minimal" discipline
 * this file's own spec calls for.
 *
 * Kept as a pure, side-effect-free lookup so it can be unit tested without
 * a database.
 */
export const PAYMENT_ACCOUNT_STATE_TRANSITIONS: Readonly<
  Record<PaymentAccountStatus, readonly PaymentAccountStatus[]>
> = {
  PENDING: ['ACTIVE', 'DISABLED'],
  ACTIVE: ['DISABLED'],
  DISABLED: ['ACTIVE'],
};

export function isPaymentAccountTransitionAllowed(
  from: PaymentAccountStatus,
  to: PaymentAccountStatus,
): boolean {
  return PAYMENT_ACCOUNT_STATE_TRANSITIONS[from].includes(to);
}
