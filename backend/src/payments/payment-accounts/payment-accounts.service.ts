import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentAccount,
  PaymentAccountStatus,
  PaymentProviderType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { resolveTenantAuditActor } from '../../common/audit/tenant-actor-attribution';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { assertObjectInTenant } from '../../common/tenant/object-auth';
import { resolvePrimaryStoreId } from '../../common/tenant/primary-store';
import { TenantContext } from '../../common/tenant/tenant-context';
import { getTenantScopedClient } from '../../common/tenant/tenant-prisma';
import { PaginatedResult } from '../../common/types/api-response.interface';
import { CreatePaymentAccountDto } from './dto/create-payment-account.dto';
import { ListPaymentAccountsQueryDto } from './dto/list-payment-accounts-query.dto';
import { PaymentAccountView } from './dto/payment-account-view.interface';
import { isPaymentAccountTransitionAllowed } from './payment-account-state-machine';

const DUPLICATE_MESSAGE = (provider: PaymentProviderType) =>
  `This store already has a ${provider} payment account`;

/**
 * Phase 8 (P8-4/P8-5) — Merchant Payment Account foundation. `PermissionsGuard`'s
 * `@RequirePermission('payment-account:manage')` check
 * (`payment-accounts.controller.ts`) already restricts every route this
 * service backs to an authenticated caller whose resolved `TenantContext`
 * carries that permission — G-13 grants it to `OWNER` only, unmodified —
 * before any method here runs; this class does not re-check role/
 * permission, it receives the actor/tenantContext only to scope queries
 * and attribute audit rows, same discipline `TeamService`/`CouponsService`
 * already establish.
 *
 * `PaymentAccount` is a commerce-domain table, not one of the six D4
 * tenancy models (`tenant-data-access-guard.spec.ts`'s own
 * `TENANCY_MODELS`) — every query here uses the plain `PrismaService` with
 * an explicit `tenantId` filter, the same convention `orders`/
 * `payment_attempts`/every other commerce table already uses. The tenant-
 * scoped client (`getTenantScopedClient`) is used ONLY for the one
 * genuine cross-model check this service needs — confirming a
 * caller-supplied `storeId` actually belongs to the caller's own tenant
 * (`Store` IS one of the six D4 models) — exactly the same pattern
 * `resolvePrimaryStoreId` (`common/tenant/primary-store.ts`) already
 * establishes for the identical need.
 *
 * P8-4 scope: no provider API call, no webhook handling. P8-5 adds exactly
 * two methods that touch `credentialsEncrypted` — `configureCredentials`
 * (persists an ALREADY-ENCRYPTED blob) and `getEncryptedCredentials` (reads
 * the raw blob back) — but this class still never encrypts, decrypts, or
 * sees plaintext credentials, and never calls Razorpay. That stays behind
 * `CredentialEncryptionService` and `RazorpayAccountVerifierService`,
 * orchestrated by `PaymentAccountConnectionService`.
 */
@Injectable()
export class PaymentAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── POST /admin/payment-accounts ──────────────────────────────────────

  async create(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    dto: CreatePaymentAccountDto,
  ): Promise<PaymentAccountView> {
    const tenantId = tenantContext.tenantId;
    const storeId = dto.storeId
      ? await this.assertStoreInTenant(tenantId, dto.storeId)
      : await resolvePrimaryStoreId(this.prisma, tenantId);

    // Friendly, race-tolerant pre-check — the real backstop is the DB's
    // own `@@unique([storeId, provider])` constraint, caught below exactly
    // like `PaymentsService.isUniqueConstraintViolation` already does for
    // its own partial-unique-index race (payments.service.ts).
    const existing = await this.prisma.paymentAccount.findUnique({
      where: { storeId_provider: { storeId, provider: dto.provider } },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_MESSAGE(dto.provider));
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.paymentAccount.create({
          data: {
            tenantId,
            storeId,
            provider: dto.provider,
            mode: dto.mode,
            displayName: dto.displayName,
          },
        });

        await this.writeAudit(tx, tenantContext, actor, {
          action: 'payment_account.create',
          targetId: created.id,
          metadata: {
            storeId,
            provider: dto.provider,
            mode: dto.mode,
          },
        });

        return this.toView(created);
      });
    } catch (err) {
      if (this.isUniqueConstraintViolation(err)) {
        throw new ConflictException(DUPLICATE_MESSAGE(dto.provider));
      }
      throw err;
    }
  }

  // ─── GET /admin/payment-accounts ───────────────────────────────────────

  async list(
    tenantId: string,
    query: ListPaymentAccountsQueryDto,
  ): Promise<PaginatedResult<PaymentAccountView>> {
    const where: Prisma.PaymentAccountWhereInput = { tenantId };

    const [rows, total] = await Promise.all([
      this.prisma.paymentAccount.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.paymentAccount.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toView(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  // ─── GET /admin/payment-accounts/:id ───────────────────────────────────

  async getOne(tenantId: string, id: string): Promise<PaymentAccountView> {
    const row = await this.prisma.paymentAccount.findUnique({
      where: { id },
    });
    // Cross-tenant access is indistinguishable from "not found" (404,
    // never 403) — same existence-leak reasoning as every other
    // `assertObjectInTenant` call site (`object-auth.ts`).
    assertObjectInTenant(row, tenantId);
    return this.toView(row);
  }

  // ─── POST /admin/payment-accounts/:id/activate ─────────────────────────
  //
  // Valid from PENDING (first activation) or DISABLED (reactivation) —
  // both collapse into one operation/one route (P8-3 §4: "keep the state
  // machine minimal"); the state machine itself is what actually
  // distinguishes the two starting states, not a second endpoint.

  async activate(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    id: string,
  ): Promise<PaymentAccountView> {
    return this.transition(
      tenantContext,
      actor,
      id,
      PaymentAccountStatus.ACTIVE,
      'payment_account.activate',
    );
  }

  // ─── POST /admin/payment-accounts/:id/disable ──────────────────────────

  async disable(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    id: string,
  ): Promise<PaymentAccountView> {
    return this.transition(
      tenantContext,
      actor,
      id,
      PaymentAccountStatus.DISABLED,
      'payment_account.disable',
    );
  }

  // ─── POST /admin/payment-accounts/:id/connect (P8-5) ───────────────────
  //
  // Persistence-only half of the credential-configure operation (P8-3 §7 /
  // PHASE-8-ARCHITECTURE-AND-SCHEMA-SPEC.md item 3): accepts an
  // ALREADY-ENCRYPTED blob. This class never sees plaintext credentials,
  // never imports CredentialEncryptionService, and never calls Razorpay —
  // see `PaymentAccountConnectionService`, the P8-5 orchestrator that
  // actually encrypts/verifies before calling this method. Keeps this
  // controller/service pair free of any Razorpay-specific logic, per the
  // task's own provider-boundary rule.

  async configureCredentials(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    id: string,
    encryptedCredentials: Buffer,
  ): Promise<void> {
    const tenantId = tenantContext.tenantId;

    await this.prisma.$transaction(async (tx) => {
      const target = await tx.paymentAccount.findUnique({ where: { id } });
      assertObjectInTenant(target, tenantId);

      // Plain, non-CAS update — replacing the credential blob is not a
      // status-machine transition, just an atomic field replace + stamp.
      await tx.paymentAccount.update({
        where: { id },
        data: {
          // Copied into a plain (non-shared) ArrayBuffer-backed Uint8Array
          // — Prisma's generated `Bytes` input type is stricter than
          // Node's own `Buffer<ArrayBufferLike>` about ruling out
          // `SharedArrayBuffer`; same bytes either way.
          credentialsEncrypted: new Uint8Array(encryptedCredentials),
          credentialsUpdatedAt: new Date(),
        },
      });

      await this.writeAudit(tx, tenantContext, actor, {
        action: 'payment_account.credentials_configured',
        targetId: id,
        // No credential material of any kind — ciphertext included.
        metadata: {},
      });
    });
  }

  /** Tenant-checked read of the raw encrypted blob — `null` when the
   * account has no credentials configured yet. The only caller is
   * `PaymentAccountConnectionService`'s stored-credential "test connection"
   * branch; the returned `Buffer` is opaque ciphertext, never decrypted
   * here (decryption happens only inside `RazorpayAccountVerifierService`,
   * P8-D6 §7). */
  async getEncryptedCredentials(
    tenantId: string,
    id: string,
  ): Promise<Buffer | null> {
    const row = await this.prisma.paymentAccount.findUnique({
      where: { id },
    });
    assertObjectInTenant(row, tenantId);
    // Prisma returns the `Bytes` column as a `Uint8Array` — wrapped into a
    // real `Buffer` so callers (`RazorpayAccountVerifierService`,
    // `CredentialEncryptionService`) get the Buffer-specific API they use.
    return row.credentialsEncrypted
      ? Buffer.from(row.credentialsEncrypted)
      : null;
  }

  // ─── Store -> active PaymentAccount resolution (P8-3 §6) ───────────────
  //
  // Not wired into checkout/payments by this stage (P8-4 scope: schema +
  // lifecycle only) — provided so the resolution rule itself
  // ("a DISABLED account is never usable as an active one") is a real,
  // independently testable unit rather than an assumption a later stage
  // has to get right blind.

  async findActiveAccountForStore(
    tenantId: string,
    storeId: string,
    provider: PaymentProviderType,
  ): Promise<PaymentAccountView | null> {
    const row = await this.prisma.paymentAccount.findUnique({
      where: { storeId_provider: { storeId, provider } },
    });
    if (!row || row.tenantId !== tenantId) {
      return null;
    }
    if (row.status !== PaymentAccountStatus.ACTIVE) {
      return null;
    }
    return this.toView(row);
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────

  private async transition(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    id: string,
    to: PaymentAccountStatus,
    action: string,
  ): Promise<PaymentAccountView> {
    const tenantId = tenantContext.tenantId;

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.paymentAccount.findUnique({ where: { id } });
      assertObjectInTenant(target, tenantId);

      if (!isPaymentAccountTransitionAllowed(target.status, to)) {
        throw new ConflictException(
          `Cannot transition a ${target.status} payment account to ${to}`,
        );
      }

      const timestamps: Prisma.PaymentAccountUpdateInput =
        to === PaymentAccountStatus.ACTIVE
          ? { connectedAt: new Date(), disabledAt: null, disabledReason: null }
          : { disabledAt: new Date() };

      const cas = await tx.paymentAccount.updateMany({
        where: { id, status: target.status },
        data: { status: to, ...timestamps },
      });
      if (cas.count !== 1) {
        throw new ConflictException(
          'Payment account status changed concurrently — retry',
        );
      }

      await this.writeAudit(tx, tenantContext, actor, {
        action,
        targetId: id,
        metadata: { fromStatus: target.status, toStatus: to },
      });

      const updated = await tx.paymentAccount.findUniqueOrThrow({
        where: { id },
      });
      return this.toView(updated);
    });
  }

  /** `storeId` belongs to the caller's own tenant, resolved server-side —
   * never trusted as given (invariant 1). Goes through the tenant-scoped
   * client (`Store` IS a D4 tenancy model), same pattern
   * `resolvePrimaryStoreId` already establishes. */
  private async assertStoreInTenant(
    tenantId: string,
    storeId: string,
  ): Promise<string> {
    const scoped = getTenantScopedClient(this.prisma, tenantId);
    const store = await scoped.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException('Store not found for this tenant');
    }
    return store.id;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    action: {
      action: string;
      targetId: string;
      metadata: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const attribution = await resolveTenantAuditActor(tx, tenantContext, actor);
    await this.auditService.logTenantAction(tx, {
      tenantId: tenantContext.tenantId,
      ...attribution,
      action: action.action,
      targetType: 'PaymentAccount',
      targetId: action.targetId,
      metadata: action.metadata,
    });
  }

  /** Public: mirrors `PaymentsService.isUniqueConstraintViolation` — used
   * both internally (above) and available for a future caller that needs
   * to classify the same race. */
  isUniqueConstraintViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }

  // ─── View assembly (field-by-field — never a spread) ────────────────
  //
  // Deliberately never includes `credentialsEncrypted`/
  // `credentialsUpdatedAt`/`tenantId` — see `PaymentAccountView`'s own
  // comment.

  private toView(row: PaymentAccount): PaymentAccountView {
    return {
      id: row.id,
      storeId: row.storeId,
      provider: row.provider,
      status: row.status,
      mode: row.mode,
      displayName: row.displayName,
      connectedAt: row.connectedAt,
      disabledAt: row.disabledAt,
      disabledReason: row.disabledReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
