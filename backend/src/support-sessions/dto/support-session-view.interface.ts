import type { Permission } from '../../auth/permissions/permission';
import type { SupportSessionStatusFilter } from './list-support-sessions-query.dto';

/**
 * GET /platform/support-sessions[/create|/revoke] response shape. There is
 * no secret/token column on `SupportSession` to accidentally leak (see the
 * model's own schema comment) — every field below is exactly the row's own
 * non-sensitive columns plus one computed field (`status`), never a
 * superset of what `SupportSessionService`'s Prisma selects.
 */
export interface SupportSessionView {
  id: string;
  tenantId: string;
  createdByUserId: string;
  justification: string;
  grantedPermissions: Permission[];
  expiresAt: Date;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
  /** Derived at read time from `revokedAt`/`expiresAt` — never a stored
   * column (the model deliberately has none; see its schema comment). */
  status: SupportSessionStatusFilter;
}
