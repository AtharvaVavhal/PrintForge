import { PaymentAccountStatus } from '@prisma/client';
import {
  isPaymentAccountTransitionAllowed,
  PAYMENT_ACCOUNT_STATE_TRANSITIONS,
} from './payment-account-state-machine';

describe('PaymentAccount state machine (P8-3 architecture spec §4)', () => {
  it('allows PENDING -> ACTIVE', () => {
    expect(isPaymentAccountTransitionAllowed('PENDING', 'ACTIVE')).toBe(true);
  });

  it('allows PENDING -> DISABLED', () => {
    expect(isPaymentAccountTransitionAllowed('PENDING', 'DISABLED')).toBe(
      true,
    );
  });

  it('allows ACTIVE -> DISABLED', () => {
    expect(isPaymentAccountTransitionAllowed('ACTIVE', 'DISABLED')).toBe(
      true,
    );
  });

  it('allows DISABLED -> ACTIVE (reactivation)', () => {
    expect(isPaymentAccountTransitionAllowed('DISABLED', 'ACTIVE')).toBe(
      true,
    );
  });

  it('rejects ACTIVE -> PENDING (no going backwards)', () => {
    expect(isPaymentAccountTransitionAllowed('ACTIVE', 'PENDING')).toBe(
      false,
    );
  });

  it('rejects DISABLED -> PENDING (credential-replacement path deferred to a later stage)', () => {
    expect(isPaymentAccountTransitionAllowed('DISABLED', 'PENDING')).toBe(
      false,
    );
  });

  it('rejects a same-state no-op transition (PENDING -> PENDING)', () => {
    expect(isPaymentAccountTransitionAllowed('PENDING', 'PENDING')).toBe(
      false,
    );
  });

  it('rejects a same-state no-op transition (ACTIVE -> ACTIVE)', () => {
    expect(isPaymentAccountTransitionAllowed('ACTIVE', 'ACTIVE')).toBe(false);
  });

  it('rejects a same-state no-op transition (DISABLED -> DISABLED)', () => {
    expect(isPaymentAccountTransitionAllowed('DISABLED', 'DISABLED')).toBe(
      false,
    );
  });

  it('every PaymentAccountStatus enum value has an entry in the transition table', () => {
    const allStatuses = Object.values(PaymentAccountStatus);
    for (const status of allStatuses) {
      expect(PAYMENT_ACCOUNT_STATE_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('the transition table names no status outside the real enum (positive/negative control)', () => {
    const allStatuses = new Set(Object.values(PaymentAccountStatus));
    for (const targets of Object.values(PAYMENT_ACCOUNT_STATE_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStatuses.has(target)).toBe(true);
      }
    }
  });
});
