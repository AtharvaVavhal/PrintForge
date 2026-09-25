import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_STOREFRONT_RESOLUTION_MODE,
  STOREFRONT_RESOLUTION_MODE_KEY,
} from '../../src/platform/platform-config/storefront-resolution-mode.constants';

/**
 * Phase 9 §16.2 — `StoreDomain` / `PlatformConfig` data backfill. NOT a Prisma
 * migration and NOT `prisma db seed` (§16.2: authored in W2, executed against
 * production by an operator in W8 step 4, with the reconciliation output pasted
 * into the W8 report). Kept out of `prisma/migrations/` and therefore out of
 * the additive-only migration-safety guard's scope, exactly as the Phase 4
 * backfill is.
 *
 * Steps, verbatim from §16.2:
 *
 *   B-1  every `StoreDomain` with `type IS NULL` -> `CUSTOM`, unless the
 *        hostname is under `PLATFORM_STOREFRONT_DOMAIN` -> `PLATFORM_SUBDOMAIN`
 *   B-2  every `Store` without a `PLATFORM_SUBDOMAIN` row -> insert
 *        `{slug}.{PLATFORM_STOREFRONT_DOMAIN}`, `VERIFIED`,
 *        `isPrimary = (store has no primary domain)`
 *   B-3  Tenant #1 ONLY -> insert `www.printforge.world` as `CUSTOM`, `VERIFIED`,
 *        `verificationMethod = null`, `tlsStatus = ISSUED`, `isPrimary = true`;
 *        the B-2 platform-subdomain row for that store becomes non-primary
 *   B-4  insert the `PlatformConfig` row
 *        `storefront.domain_resolution_mode = legacy_single_store` explicitly,
 *        so W8's flip is an UPDATE with a `from` value in the audit
 *
 * ── SAFETY PROPERTIES (why this is safe to run more than once) ──
 *
 *  - **Idempotent by WHERE clause, not by a dedup pass.** B-1 only touches
 *    `type IS NULL`; B-2 only inserts for a store that has no
 *    `PLATFORM_SUBDOMAIN` row; B-3 only inserts when its hostname is absent;
 *    B-4 only inserts when the key is absent. A rerun is a guaranteed no-op
 *    for everything already done.
 *  - **Never destructive.** No DELETE anywhere. The only UPDATE that clears a
 *    field is B-3 demoting the platform subdomain from primary, which §16.2
 *    mandates and which is required by the partial unique index
 *    `store_domains_store_primary_unique`.
 *  - **Never overwrites a non-NULL value.** B-1 cannot "correct" a wrong
 *    existing `type`; a row that already has one is reported, not rewritten.
 *  - **Never invents a hostname.** Every hostname is derived from data that
 *    already exists: `Store.slug` + the configured platform domain (B-2), or
 *    the literal §16.2 fixes for Tenant #1 (B-3). If the platform domain is
 *    not configured, B-1/B-2 REFUSE to run rather than guess.
 *  - **Explicit target, no auto-discovery.** B-3 requires `--tenant-id`; it
 *    never picks "the oldest tenant" or "the only tenant" for itself.
 *  - **Anomalies are reported, never repaired.** Two stores whose slugs derive
 *    the same hostname, a store that already has two primaries, a Tenant #1
 *    hostname owned by another store — each is surfaced for human resolution.
 *
 * Usage (operator, via `!`):
 *   npx ts-node prisma/backfill/phase9-w2-store-domain-backfill.ts \
 *     --tenant-id <uuid> [--dry-run]
 *
 * `--dry-run` performs every real write inside ONE transaction that is ALWAYS
 * rolled back, so the reported counts are the counts a real run would produce.
 * Required env: `PLATFORM_STOREFRONT_DOMAIN` (§5.2 — no default anywhere).
 */

/**
 * §16.2 B-3 fixes this hostname for Tenant #1; it is never derived.
 *
 * ⚖️ P9-D10 (2026-09-25, OPTION B) replaced the previous `www.printforge.in`
 * with `www.printforge.world`. The old value rested on a premise that was never
 * true: `printforge.in` is registered but has never been delegated (NXDOMAIN),
 * so nothing was "already served" there. `www.printforge.world` sits under the
 * owner-controlled `printforge.world`, and is deliberately NOT under
 * `PLATFORM_STOREFRONT_DOMAIN` (`stores.printforge.world`) so this row stays a
 * genuine `CUSTOM` domain and keeps exercising the §4.3 serving gate.
 */
export const TENANT_1_CUSTOM_HOSTNAME = 'www.printforge.world';

export type Client = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface StepResult {
  step: 'B-1' | 'B-2' | 'B-3' | 'B-4';
  action: string;
  affected: number;
  /** Surfaced for human resolution — never auto-repaired. */
  anomalies: string[];
}

export interface Reconciliation {
  /** B-1: must be 0. */
  storeDomainsWithNullType: number;
  /** B-2: must equal `stores`. */
  stores: number;
  platformSubdomainRows: number;
  storesWithoutPlatformSubdomain: number;
  /** B-2: every store must have exactly one primary. */
  storesWithoutPrimaryDomain: number;
  storesWithMultiplePrimaryDomains: number;
  /** B-3. */
  tenant1PrimaryHostname: string | null;
  /** B-4: must be the explicit legacy row. */
  resolutionModeRow: string | null;
}

const prisma = new PrismaClient();

export function parseArgs(argv = process.argv.slice(2)): {
  tenantId: string;
  dryRun: boolean;
} {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(`--${flag}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tenantId = get('tenant-id') ?? process.env.PHASE9_TENANT_ID;
  if (!tenantId) {
    throw new Error(
      'Missing --tenant-id (Tenant #1). This tool never auto-discovers its B-3 target.',
    );
  }
  return { tenantId, dryRun: argv.includes('--dry-run') };
}

/**
 * §5.2: no default, in any environment. B-1 and B-2 both derive meaning from
 * it, so an unset value is a hard stop rather than a skipped step — silently
 * classifying every row as `CUSTOM` would be a wrong answer, not a missing one.
 */
export function requirePlatformStorefrontDomain(
  raw = process.env.PLATFORM_STOREFRONT_DOMAIN,
): string {
  const value = raw?.trim().toLowerCase().replace(/\.$/, '') ?? '';
  if (value.length === 0) {
    throw new Error(
      'PLATFORM_STOREFRONT_DOMAIN is not set — B-1 cannot classify hostnames and B-2 cannot derive one. Refusing to guess (spec §5.2).',
    );
  }
  return value;
}

/** True when `hostname` is the platform domain or one level under it. */
export function isUnderPlatformDomain(
  hostname: string,
  platformDomain: string,
): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, '');
  return h === platformDomain || h.endsWith(`.${platformDomain}`);
}

export function derivePlatformHostname(
  storeSlug: string,
  platformDomain: string,
): string {
  return `${storeSlug.trim().toLowerCase()}.${platformDomain}`;
}

// ─── B-1 ────────────────────────────────────────────────────────────────

/**
 * Classifies every `type IS NULL` row. Expected to be a no-op in production —
 * `storefront-tenant.resolver.ts` records that no `store_domains` row exists
 * there today — and the reconciliation query is what PROVES that rather than
 * assuming it.
 */
export async function backfillDomainTypes(
  client: Client,
  platformDomain: string,
): Promise<StepResult> {
  const rows = await client.storeDomain.findMany({
    where: { type: null },
    select: { id: true, hostname: true },
  });

  let affected = 0;
  for (const row of rows) {
    const type = isUnderPlatformDomain(row.hostname, platformDomain)
      ? 'PLATFORM_SUBDOMAIN'
      : 'CUSTOM';
    // `type: null` stays in the WHERE clause: a concurrent run that already
    // classified this row must not be overwritten.
    const res = await client.storeDomain.updateMany({
      where: { id: row.id, type: null },
      data: { type },
    });
    affected += res.count;
  }

  return {
    step: 'B-1',
    action:
      'classify store_domains.type (CUSTOM unless under the platform domain)',
    affected,
    anomalies: [],
  };
}

// ─── B-2 ────────────────────────────────────────────────────────────────

/**
 * Gives every store its always-on `PLATFORM_SUBDOMAIN` row. `isPrimary` is set
 * only when the store has no primary domain yet — §16.2's own rule, and the
 * one the partial unique index enforces.
 *
 * Collisions are reported, never resolved: `Store.slug` is not globally unique
 * (spec S-5 leaves that deliberately out of scope), so two tenants can derive
 * the same hostname. Inventing a suffix here would silently give a store a
 * hostname nobody chose.
 */
export async function backfillPlatformSubdomains(
  client: Client,
  platformDomain: string,
): Promise<StepResult> {
  const stores = await client.store.findMany({
    select: { id: true, tenantId: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });

  const anomalies: string[] = [];
  let affected = 0;

  for (const store of stores) {
    const existing = await client.storeDomain.findFirst({
      where: { storeId: store.id, type: 'PLATFORM_SUBDOMAIN' },
      select: { id: true },
    });
    if (existing) {
      continue; // idempotent: already provisioned
    }

    const hostname = derivePlatformHostname(store.slug, platformDomain);
    const holder = await client.storeDomain.findUnique({
      where: { hostname },
      select: { storeId: true },
    });
    if (holder && holder.storeId !== store.id) {
      anomalies.push(
        `B-2 collision: store ${store.id} (slug "${store.slug}") derives "${hostname}", already held by store ${holder.storeId} — not inserted, resolve the slug conflict manually (S-5)`,
      );
      continue;
    }

    const primary = await client.storeDomain.findFirst({
      where: { storeId: store.id, isPrimary: true },
      select: { id: true },
    });

    await client.storeDomain.create({
      data: {
        storeId: store.id,
        tenantId: store.tenantId,
        hostname,
        type: 'PLATFORM_SUBDOMAIN',
        verificationStatus: 'VERIFIED',
        verificationMethod: null,
        verificationToken: null,
        verifiedAt: new Date(),
        // Never consulted for this type — the wildcard covers it (§7.2).
        tlsStatus: null,
        isPrimary: primary === null,
      },
    });
    affected += 1;
  }

  return {
    step: 'B-2',
    action: 'insert a PLATFORM_SUBDOMAIN row for every store lacking one',
    affected,
    anomalies,
  };
}

// ─── B-3 ────────────────────────────────────────────────────────────────

/**
 * Tenant #1 only (⚖️ D3 — production has exactly one tenant). Writes
 * `TENANT_1_CUSTOM_HOSTNAME` as a `CUSTOM`, `VERIFIED`, `ISSUED`, primary row.
 *
 * ⚠️ OPERATOR PRECONDITION (⚖️ P9-D10, §16.2) — this step RECORDS ownership
 * and TLS; it does not establish them, and it cannot detect their absence.
 * Before it is run against production, all three must ALREADY be true and have
 * been independently observed:
 *
 *   1. DNS for `TENANT_1_CUSTOM_HOSTNAME` is correctly delegated and resolves
 *      publicly (verify against a public resolver, not a local/default one).
 *   2. The hostname is attached and configured at the hosting provider
 *      (Vercel project domain reporting `verified`, not `misconfigured`).
 *   3. HTTPS/TLS is independently observed on the hostname — a real handshake
 *      presenting a certificate that covers it. The provider reporting
 *      "configured" is NOT a certificate observation (see §17.1a `E-DNS-3`
 *      vs `E-DNS-4`, and §19.1 slot 8).
 *
 * `verificationMethod` is null and `tlsStatus` is `ISSUED` because this row is
 * a platform-recorded fact rather than a DNS-challenge outcome — which is
 * exactly why the precondition above is mandatory. **A hostname being fixed in
 * this source file is not evidence that anyone owns it or that a certificate
 * exists for it.** Run with `--dry-run` first; if the precondition is not met,
 * do not run the real pass — `isPrimary = true` makes this hostname Tenant #1's
 * `canonicalOrigin` (§11), so an unreachable value here redirects live
 * storefront traffic into a dead host.
 *
 * This step itself changes no DNS, attaches no domain and issues no
 * certificate. It performs exactly what §16.2 specifies for the tenant id the
 * operator names, and reports anything that does not match instead of adapting
 * to it.
 */
export async function backfillTenant1CustomDomain(
  client: Client,
  tenantId: string,
): Promise<StepResult> {
  const anomalies: string[] = [];

  const store = await client.store.findFirst({
    where: { tenantId, isPrimary: true },
    select: { id: true },
  });
  if (!store) {
    return {
      step: 'B-3',
      action: `register ${TENANT_1_CUSTOM_HOSTNAME} as Tenant #1's primary custom domain`,
      affected: 0,
      anomalies: [
        `B-3: tenant ${tenantId} has no primary Store — nothing registered (D11 expects exactly one)`,
      ],
    };
  }

  const existing = await client.storeDomain.findUnique({
    where: { hostname: TENANT_1_CUSTOM_HOSTNAME },
    select: { id: true, storeId: true, isPrimary: true },
  });

  if (existing && existing.storeId !== store.id) {
    return {
      step: 'B-3',
      action: `register ${TENANT_1_CUSTOM_HOSTNAME} as Tenant #1's primary custom domain`,
      affected: 0,
      anomalies: [
        `B-3: "${TENANT_1_CUSTOM_HOSTNAME}" is already held by store ${existing.storeId}, not tenant ${tenantId}'s store ${store.id} — not modified`,
      ],
    };
  }

  let affected = 0;
  if (!existing) {
    // Demote first: the partial unique index rejects two primaries per store.
    await client.storeDomain.updateMany({
      where: { storeId: store.id, isPrimary: true },
      data: { isPrimary: false },
    });
    await client.storeDomain.create({
      data: {
        storeId: store.id,
        tenantId,
        hostname: TENANT_1_CUSTOM_HOSTNAME,
        type: 'CUSTOM',
        verificationStatus: 'VERIFIED',
        // Recorded as a platform action, not the outcome of a DNS challenge —
        // so there is no method and no token (§16.2). The operator precondition
        // on this function is what makes the claim true; this code cannot
        // verify it.
        verificationMethod: null,
        verificationToken: null,
        verifiedAt: new Date(),
        // Asserts the certificate the hosting provider serves for this
        // hostname. Must have been independently observed first (precondition
        // 3 above) — this is not a live check.
        tlsStatus: 'ISSUED',
        isPrimary: true,
      },
    });
    affected = 1;
  } else if (!existing.isPrimary) {
    await client.storeDomain.updateMany({
      where: { storeId: store.id, isPrimary: true },
      data: { isPrimary: false },
    });
    const res = await client.storeDomain.updateMany({
      where: { id: existing.id, isPrimary: false },
      data: { isPrimary: true },
    });
    affected = res.count;
  }

  return {
    step: 'B-3',
    action: `register ${TENANT_1_CUSTOM_HOSTNAME} as Tenant #1's primary custom domain`,
    affected,
    anomalies,
  };
}

// ─── B-4 ────────────────────────────────────────────────────────────────

/**
 * Writes the resolution mode EXPLICITLY, so W8 step 7's flip is an UPDATE
 * carrying a `from` value into `PlatformAuditLog` rather than an insert with no
 * previous state. An existing row is never overwritten — if an operator has
 * already set a mode, that is their decision, not this script's to undo.
 */
export async function backfillResolutionModeRow(
  client: Client,
): Promise<StepResult> {
  const existing = await client.platformConfig.findUnique({
    where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
    select: { value: true },
  });
  if (existing) {
    return {
      step: 'B-4',
      action: `insert ${STOREFRONT_RESOLUTION_MODE_KEY} = ${DEFAULT_STOREFRONT_RESOLUTION_MODE}`,
      affected: 0,
      anomalies:
        existing.value === DEFAULT_STOREFRONT_RESOLUTION_MODE
          ? []
          : [
              `B-4: the row already exists with value "${existing.value}" (not the expected "${DEFAULT_STOREFRONT_RESOLUTION_MODE}") — left untouched`,
            ],
    };
  }
  await client.platformConfig.create({
    data: {
      key: STOREFRONT_RESOLUTION_MODE_KEY,
      value: DEFAULT_STOREFRONT_RESOLUTION_MODE,
      // No actor: this is a migration-time seed, not an operator flip. The
      // FK is nullable precisely for this case (spec §3.3).
      updatedByUserId: null,
    },
  });
  return {
    step: 'B-4',
    action: `insert ${STOREFRONT_RESOLUTION_MODE_KEY} = ${DEFAULT_STOREFRONT_RESOLUTION_MODE}`,
    affected: 1,
    anomalies: [],
  };
}

// ─── orchestration + reconciliation ─────────────────────────────────────

export async function runAllSteps(
  client: Client,
  tenantId: string,
  platformDomain: string,
): Promise<StepResult[]> {
  return [
    await backfillDomainTypes(client, platformDomain),
    await backfillPlatformSubdomains(client, platformDomain),
    await backfillTenant1CustomDomain(client, tenantId),
    await backfillResolutionModeRow(client),
  ];
}

/**
 * The §16.2 reconciliation queries, and the evidence §19 E-2 requires
 * ("B-2 reconciliation = 0 stores without a platform row; every store has
 * exactly one primary"). Read-only.
 */
export async function reconcile(
  client: Client,
  tenantId: string,
): Promise<Reconciliation> {
  const [storeDomainsWithNullType, stores, platformSubdomainRows] =
    await Promise.all([
      client.storeDomain.count({ where: { type: null } }),
      client.store.count(),
      client.storeDomain.count({ where: { type: 'PLATFORM_SUBDOMAIN' } }),
    ]);

  const allStores = await client.store.findMany({ select: { id: true } });
  let storesWithoutPlatformSubdomain = 0;
  let storesWithoutPrimaryDomain = 0;
  let storesWithMultiplePrimaryDomains = 0;
  for (const store of allStores) {
    const [platformCount, primaryCount] = await Promise.all([
      client.storeDomain.count({
        where: { storeId: store.id, type: 'PLATFORM_SUBDOMAIN' },
      }),
      client.storeDomain.count({
        where: { storeId: store.id, isPrimary: true },
      }),
    ]);
    if (platformCount === 0) storesWithoutPlatformSubdomain += 1;
    if (primaryCount === 0) storesWithoutPrimaryDomain += 1;
    if (primaryCount > 1) storesWithMultiplePrimaryDomains += 1;
  }

  const tenant1Primary = await client.storeDomain.findFirst({
    where: { tenantId, isPrimary: true },
    select: { hostname: true },
  });
  const modeRow = await client.platformConfig.findUnique({
    where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
    select: { value: true },
  });

  return {
    storeDomainsWithNullType,
    stores,
    platformSubdomainRows,
    storesWithoutPlatformSubdomain,
    storesWithoutPrimaryDomain,
    storesWithMultiplePrimaryDomains,
    tenant1PrimaryHostname: tenant1Primary?.hostname ?? null,
    resolutionModeRow: modeRow?.value ?? null,
  };
}

/** Pass/fail verdicts for the numbers above, for the W8 report. */
export function reconciliationVerdicts(
  r: Reconciliation,
): { check: string; pass: boolean; detail: string }[] {
  return [
    {
      check: 'B-1 no unclassified domain types',
      pass: r.storeDomainsWithNullType === 0,
      detail: `store_domains WHERE type IS NULL = ${r.storeDomainsWithNullType} (expected 0)`,
    },
    {
      check: 'B-2 every store has a platform subdomain (E-2)',
      pass: r.storesWithoutPlatformSubdomain === 0,
      detail: `stores without a PLATFORM_SUBDOMAIN row = ${r.storesWithoutPlatformSubdomain} (expected 0); stores=${r.stores}, platform rows=${r.platformSubdomainRows}`,
    },
    {
      check: 'B-2 every store has exactly one primary domain',
      pass:
        r.storesWithoutPrimaryDomain === 0 &&
        r.storesWithMultiplePrimaryDomains === 0,
      detail: `stores with 0 primaries = ${r.storesWithoutPrimaryDomain}, with >1 = ${r.storesWithMultiplePrimaryDomains} (both expected 0)`,
    },
    {
      check: `B-3 Tenant #1 primary is ${TENANT_1_CUSTOM_HOSTNAME}`,
      pass: r.tenant1PrimaryHostname === TENANT_1_CUSTOM_HOSTNAME,
      detail: `tenant primary hostname = ${r.tenant1PrimaryHostname ?? '(none)'}`,
    },
    {
      check: 'B-4 resolution-mode row exists and is legacy',
      pass: r.resolutionModeRow === DEFAULT_STOREFRONT_RESOLUTION_MODE,
      detail: `${STOREFRONT_RESOLUTION_MODE_KEY} = ${r.resolutionModeRow ?? '(absent)'}`,
    },
  ];
}

const DRY_RUN_ROLLBACK_SENTINEL =
  'PHASE9_BACKFILL_DRY_RUN_ROLLBACK_DO_NOT_LEAK';

async function main(): Promise<void> {
  const { tenantId, dryRun } = parseArgs();
  const platformDomain = requirePlatformStorefrontDomain();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    throw new Error(`--tenant-id ${tenantId} does not exist`);
  }

  console.log(
    `Phase 9 §16.2 backfill — mode=${
      dryRun
        ? 'DRY-RUN (one transaction, always rolled back, nothing persists)'
        : 'REAL RUN (per-step committed transactions)'
    } tenant=${tenant.slug} (${tenant.id}) platformDomain=${platformDomain}`,
  );

  let results: StepResult[] = [];

  if (dryRun) {
    try {
      await prisma.$transaction(
        async (tx) => {
          results = await runAllSteps(tx, tenantId, platformDomain);
          // Reconcile INSIDE the rolled-back transaction, so the numbers are
          // the ones a real run would leave behind.
          const inner = await reconcile(tx, tenantId);
          printReconciliation(inner);
          throw new Error(DRY_RUN_ROLLBACK_SENTINEL);
        },
        { timeout: 120_000 },
      );
    } catch (err) {
      if (!(
        err instanceof Error && err.message === DRY_RUN_ROLLBACK_SENTINEL
      )) {
        throw err;
      }
    }
  } else {
    const step = async <T>(fn: (tx: Client) => Promise<T>): Promise<T> =>
      prisma.$transaction((tx) => fn(tx), { timeout: 60_000 });

    results.push(await step((c) => backfillDomainTypes(c, platformDomain)));
    results.push(
      await step((c) => backfillPlatformSubdomains(c, platformDomain)),
    );
    results.push(await step((c) => backfillTenant1CustomDomain(c, tenantId)));
    results.push(await step((c) => backfillResolutionModeRow(c)));
    printReconciliation(await reconcile(prisma, tenantId));
  }

  console.log('\n--- Phase 9 §16.2 step results ---');
  let anomalies = 0;
  for (const r of results) {
    console.log(`${r.step}  affected=${r.affected}  ${r.action}`);
    for (const a of r.anomalies) {
      anomalies += 1;
      console.log(`      ANOMALY: ${a}`);
    }
  }
  console.log(
    `\ntotalAffected=${results.reduce((n, r) => n + r.affected, 0)} anomalies=${anomalies} persisted=${!dryRun}`,
  );
  if (anomalies > 0) {
    console.log(
      'One or more anomalies were REPORTED and NOT repaired — resolve them before W8 proceeds.',
    );
  }
}

function printReconciliation(r: Reconciliation): void {
  console.log('\n--- Phase 9 §16.2 reconciliation (§19 E-2 evidence) ---');
  for (const v of reconciliationVerdicts(r)) {
    console.log(`${v.pass ? 'PASS' : 'FAIL'}  ${v.check} — ${v.detail}`);
  }
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { prisma, printReconciliation };
