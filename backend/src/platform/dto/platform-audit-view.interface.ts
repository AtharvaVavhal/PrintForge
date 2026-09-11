/**
 * GET /platform/audit — one PlatformAuditLog row. This is the platform's
 * own internal audit trail; unlike the tenant-facing views, no field needs
 * redaction here (a SUPER_ADMIN reading its own platform audit log is the
 * intended, exact audience for every field the model holds). Deliberately
 * NOT reused for TenantAuditLog — decision P5-D3 keeps the two logs and
 * their read surfaces fully separate.
 */
export interface PlatformAuditLogEntryView {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  tenantId: string | null;
  justification: string | null;
  metadata: unknown;
  ip: string;
  createdAt: Date;
}
