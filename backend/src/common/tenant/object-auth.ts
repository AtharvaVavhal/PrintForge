import { NotFoundException } from '@nestjs/common';

/**
 * Object-level tenant authorization (SaaS Master Plan §9 "object-level
 * authorization mandatory"). A second, explicit layer on top of the
 * tenant-scoped Prisma client (`tenant-prisma.ts`) — defense in depth, not
 * a replacement for it.
 *
 * Cross-tenant access returns 404, never 403 (Master Plan §9 SECURITY
 * IMPACT): a 403 would confirm the resource exists in another tenant
 * (an existence leak); a 404 does not.
 */
export function assertObjectInTenant<T extends { tenantId: string } | null>(
  resource: T,
  tenantId: string,
): asserts resource is Exclude<T, null> {
  if (!resource || resource.tenantId !== tenantId) {
    throw new NotFoundException();
  }
}
