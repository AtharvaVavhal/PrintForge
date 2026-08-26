import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { IdempotencyKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * No cleanup poller is wired for this table (out of Phase 5 scope) — this
 * only satisfies the non-null `expiresAt` column; it doesn't currently
 * gate anything.
 */
const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Backs the required Idempotency-Key header on POST /checkout/orders
 * against the idempotency_keys table (internal-only, no REST surface —
 * §20). `claim` must run inside the caller's own transaction: §13.G has
 * "claim idempotency_keys → re-validate + price → INSERT orders → clear
 * cart" as one atomic unit, so a checkout attempt that fails validation
 * after claiming leaves no orphaned claimed-but-unresolved key behind —
 * the whole transaction (including the claim) rolls back, freeing the key
 * for a genuine retry.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async findExisting(key: string): Promise<IdempotencyKey | null> {
    return this.prisma.idempotencyKey.findUnique({ where: { key } });
  }

  /**
   * Race-safe claim: INSERT...ON CONFLICT DO NOTHING RETURNING (§13.G) —
   * "not check-then-insert". Returns null if another (necessarily already
   * committed — Postgres blocks a concurrent INSERT on the same key until
   * the first resolves, so by the time this returns null the conflicting
   * row is guaranteed visible) request already claimed this key.
   */
  async claim(
    tx: Prisma.TransactionClient,
    params: { key: string; userId: string; endpoint: string },
  ): Promise<{ id: string } | null> {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS);
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO idempotency_keys (id, key, "userId", endpoint, "expiresAt", "createdAt")
      VALUES (${randomUUID()}, ${params.key}, ${params.userId}, ${params.endpoint}, ${expiresAt}, now())
      ON CONFLICT (key) DO NOTHING
      RETURNING id
    `;
    return rows[0] ?? null;
  }

  async recordResult(
    tx: Prisma.TransactionClient,
    idempotencyKeyId: string,
    orderId: string,
  ): Promise<void> {
    await tx.idempotencyKey.update({
      where: { id: idempotencyKeyId },
      data: { resultOrderId: orderId },
    });
  }
}
