import { PrismaService } from '../database/prisma.service';

/**
 * Tenant-scoped Prisma client (SaaS Master Plan §9; decision D4 — BOTH,
 * application-layer PRIMARY, docs/saas/DECISIONS.md, resolved 2026-09-07).
 *
 * Scopes the Phase 1/2a tenancy models that already carry a `tenantId`
 * column: `Store`, `StoreDomain`, `TenantMembership`, `Subscription`,
 * `Customer`. `Tenant` itself is scoped by `id` (a tenant IS the row, it has
 * no `tenantId` column). `Plan` is platform-level catalog data, not
 * tenant-owned, and is deliberately NOT scoped.
 *
 * No existing commerce table (`orders`, `carts`, `reviews`, …) has a
 * `tenantId`/`storeId`/`customerId` column yet — that is Phase 4's backfill.
 * This client therefore has nothing to scope those tables by today; domain
 * services for commerce data continue to use the plain `PrismaService`
 * until Phase 4 adds the column, at which point extending
 * `TENANT_SCOPED_MODELS` below is the mechanical, one-line change Master
 * Plan §9 anticipates ("flipped to enforced… as its data gets scoped").
 *
 * Every find/count/aggregate/create/update/delete on a scoped model gets
 * `tenantId` (or, for `Tenant`, `id`) injected into its `where`/`data` — a
 * caller cannot forget the filter because it never writes the filter
 * itself. This is the PRIMARY isolation mechanism (D4); Postgres RLS on the
 * same six tables (`prisma/migrations/…_enable_rls_tenancy_tables/`) is
 * defense-in-depth, not a replacement.
 */
const TENANT_ID_SCOPED_MODELS = new Set([
  'Store',
  'StoreDomain',
  'TenantMembership',
  'Subscription',
  'Customer',
]);

const READ_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const SINGLE_WHERE_OPERATIONS = new Set(['update', 'delete']);
const MANY_WHERE_OPERATIONS = new Set(['updateMany', 'deleteMany']);

function mergeWhere(
  args: Record<string, unknown>,
  field: string,
  value: string,
): Record<string, unknown> {
  return {
    ...args,
    where: {
      ...(args.where as Record<string, unknown> | undefined),
      [field]: value,
    },
  };
}

export function getTenantScopedClient(prisma: PrismaService, tenantId: string) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scopeField = model === 'Tenant' ? 'id' : 'tenantId';
          const isScoped =
            model === 'Tenant' || TENANT_ID_SCOPED_MODELS.has(model);

          if (!isScoped) {
            return query(args);
          }

          const typedArgs = (args ?? {}) as Record<string, unknown>;

          if (
            READ_OPERATIONS.has(operation) ||
            SINGLE_WHERE_OPERATIONS.has(operation) ||
            MANY_WHERE_OPERATIONS.has(operation)
          ) {
            return query(mergeWhere(typedArgs, scopeField, tenantId));
          }

          if (operation === 'create') {
            return query({
              ...typedArgs,
              data: {
                ...(typedArgs.data as Record<string, unknown> | undefined),
                [scopeField]: tenantId,
              },
            });
          }

          if (operation === 'createMany') {
            const data = typedArgs.data;
            const withTenant = Array.isArray(data)
              ? data.map((row: Record<string, unknown>) => ({
                  ...row,
                  [scopeField]: tenantId,
                }))
              : {
                  ...(data as Record<string, unknown>),
                  [scopeField]: tenantId,
                };
            return query({ ...typedArgs, data: withTenant });
          }

          if (operation === 'upsert') {
            return query({
              ...mergeWhere(typedArgs, scopeField, tenantId),
              create: {
                ...(typedArgs.create as Record<string, unknown> | undefined),
                [scopeField]: tenantId,
              },
            } as never);
          }

          // Any other operation on a scoped model (e.g. a raw aggregate
          // variant not enumerated above) is intentionally NOT passed
          // through unscoped — fail closed by rejecting it here rather than
          // silently executing an unfiltered query against a tenant-owned
          // table.
          throw new Error(
            `Tenant-scoped client: unhandled operation "${operation}" on model "${model}" — extend tenant-prisma.ts before using it.`,
          );
        },
      },
    },
  });
}

export type TenantScopedPrismaClient = ReturnType<typeof getTenantScopedClient>;
