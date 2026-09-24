import type {
  DomainVerificationMethod,
  DomainVerificationStatus,
  StoreDomainType,
  TlsStatus,
} from '@prisma/client';
import type { VerificationFailureReason } from './store-domain-verification';

/** The last failed verification, surfaced from TenantAuditLog (S-6). */
export interface LastVerificationFailure {
  reason: VerificationFailureReason;
  checkedAt: Date;
}

export interface StoreDomainView {
  id: string;
  hostname: string;
  type: StoreDomainType | null;
  isPrimary: boolean;
  verificationStatus: DomainVerificationStatus;
  verificationMethod: DomainVerificationMethod | null;
  tlsStatus: TlsStatus | null;
  lastCheckedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
  lastVerificationFailure: LastVerificationFailure | null;
}

export interface AddStoreDomainView {
  domain: StoreDomainView;
  verificationToken: string;
  instructions: {
    method: DomainVerificationMethod;
    record: string;
    value: string;
    text: string;
  };
}

export interface VerifyStoreDomainView {
  domain: StoreDomainView;
  /** `VERIFIED` on pass; `PENDING` on fail (S-6 — never FAILED from here). */
  verificationStatus: DomainVerificationStatus;
  lastCheckedAt: Date | null;
  /** Present only when the check failed (S-6 retention point 1). */
  reason?: VerificationFailureReason;
}
