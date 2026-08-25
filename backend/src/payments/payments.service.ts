import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(payments): Order -> PAID only via CAS update triggered by the first
  // verified-CAPTURED attempt (frontend callback or webhook, whichever wins
  // the race — both paths converge idempotently). See §12-14. The
  // (orderId) WHERE status='CAPTURED' partial unique index is the DB-level
  // backstop — never replace with application-only validation.
}
