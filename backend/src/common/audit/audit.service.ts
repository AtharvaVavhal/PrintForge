import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface PlatformAuditLogInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  tenantId?: string;
  justification?: string;
  metadata: Prisma.InputJsonValue;
  ip: string;
}

export interface TenantAuditLogInput {
  tenantId: string;
  actorMembershipId?: string;
  actorCustomerId?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Prisma.InputJsonValue;
  viaSupportSessionId?: string;
}

/**
 * Append-only audit write path (SaaS Master Plan §11; Phase 5 decisions
 * P5-D3 / P5-D4A). Two frozen models, `PlatformAuditLog` (platform-scoped)
 * and `TenantAuditLog` (tenant-scoped) — deliberately not a generic
 * AuditLog (P5-D3 rejects that design in favor of the frozen two-table
 * shape).
 *
 * Mirrors `NotificationsService.enqueueOutboxEvent`'s own convention
 * exactly: a plain `.create()` that must run inside the CALLER's own
 * transaction, so an audit record commits atomically with the action it
 * records — never written separately, never lost, never orphaned from the
 * change it describes.
 *
 * This service is a pure INSERT path. It exposes no update/delete/upsert
 * method for either model, by design — append-only is enforced structurally
 * (there is nothing here to call) and additionally checked by
 * `audit.append-only.spec.ts`'s static scan of the rest of `src/`.
 *
 * Every field, including `tenantId`, is supplied by the caller from an
 * already-resolved, trusted source (a loaded aggregate's own `tenantId`, or
 * `TenantContext`) — this service never reads a request object and never
 * derives a tenantId of its own. The untrusted client boundary is enforced
 * upstream by `TenantContextGuard` / `PermissionsGuard` before any caller of
 * this service ever runs; there is no code path here that could accept or
 * launder a client-supplied value.
 */
@Injectable()
export class AuditService {
  async logPlatformAction(
    tx: Prisma.TransactionClient,
    input: PlatformAuditLogInput,
  ): Promise<void> {
    await tx.platformAuditLog.create({ data: input });
  }

  async logTenantAction(
    tx: Prisma.TransactionClient,
    input: TenantAuditLogInput,
  ): Promise<void> {
    await tx.tenantAuditLog.create({ data: input });
  }
}
