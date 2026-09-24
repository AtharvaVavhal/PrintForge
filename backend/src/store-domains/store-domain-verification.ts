import { DomainVerificationMethod } from '@prisma/client';

/**
 * Phase 9 W5 — pure verification rules (spec §6.3). No I/O here: the
 * caller supplies the DNS answers, this file decides. Kept dependency-free
 * so the merchant path (`StoreDomainsService`) and the platform re-verify
 * path (`PlatformDomainsService`) apply the identical rule.
 *
 *   DNS_TXT : TXT record at `_printforge-verify.<hostname>` whose value
 *             equals the row's `verificationToken`.
 *   CNAME   : CNAME for `<hostname>` equal to the configured hosting-
 *             provider target (`PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET`).
 *
 * Failure reason codes are the ONLY thing retained about a failed check
 * (S-6: in the verify response, in TenantAuditLog metadata, in the log —
 * never a StoreDomain column). Machine codes, stable, no DNS payload.
 */
export const VERIFICATION_TXT_LABEL = '_printforge-verify';

export type VerificationFailureReason =
  | 'TXT_RECORD_NOT_FOUND'
  | 'TXT_VALUE_MISMATCH'
  | 'CNAME_RECORD_NOT_FOUND'
  | 'CNAME_TARGET_MISMATCH'
  | 'CNAME_TARGET_NOT_CONFIGURED'
  | 'DNS_TIMEOUT'
  | 'DNS_ERROR';

export type VerificationOutcome =
  { passed: true } | { passed: false; reason: VerificationFailureReason };

export function txtRecordName(hostname: string): string {
  return `${VERIFICATION_TXT_LABEL}.${hostname}`;
}

export function normaliseDnsTarget(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export function evaluateTxt(
  records: string[],
  token: string,
): VerificationOutcome {
  if (records.length === 0) {
    return { passed: false, reason: 'TXT_RECORD_NOT_FOUND' };
  }
  return records.some((r) => r.trim() === token)
    ? { passed: true }
    : { passed: false, reason: 'TXT_VALUE_MISMATCH' };
}

export function evaluateCname(
  records: string[],
  target: string,
): VerificationOutcome {
  if (records.length === 0) {
    return { passed: false, reason: 'CNAME_RECORD_NOT_FOUND' };
  }
  const want = normaliseDnsTarget(target);
  return records.some((r) => normaliseDnsTarget(r) === want)
    ? { passed: true }
    : { passed: false, reason: 'CNAME_TARGET_MISMATCH' };
}

/** Human-readable instructions returned with the token on add (spec §6.1). */
export function verificationInstructions(
  hostname: string,
  method: DomainVerificationMethod,
  token: string,
  cnameTarget: string | null,
): {
  method: DomainVerificationMethod;
  record: string;
  value: string;
  text: string;
} {
  if (method === DomainVerificationMethod.DNS_TXT) {
    const record = txtRecordName(hostname);
    return {
      method,
      record,
      value: token,
      text: `Create a DNS TXT record named "${record}" with the value "${token}", then run verification.`,
    };
  }
  const target = cnameTarget ?? '';
  return {
    method,
    record: hostname,
    value: target,
    text: `Point "${hostname}" at "${target}" with a DNS CNAME record, then run verification.`,
  };
}
