import {
  PaymentAccountMode,
  PaymentAccountStatus,
  PaymentProviderType,
} from '@prisma/client';

/**
 * API-facing shape of a `PaymentAccount` row. Deliberately excludes
 * `credentialsEncrypted`/`credentialsUpdatedAt`/`tenantId` — the first two
 * because a credential blob (even ciphertext) is never serialized to a
 * client (invariant 9; P8-D6 Part D), the third because it is already
 * implied by the caller's own authenticated `TenantContext` and would be a
 * redundant, spoofable-looking field to echo back.
 */
export interface PaymentAccountView {
  id: string;
  storeId: string;
  provider: PaymentProviderType;
  status: PaymentAccountStatus;
  mode: PaymentAccountMode;
  displayName: string | null;
  connectedAt: Date | null;
  disabledAt: Date | null;
  disabledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
