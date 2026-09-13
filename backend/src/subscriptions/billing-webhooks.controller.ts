import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { BillingWebhookIngestionService } from './billing-webhook-ingestion.service';

/**
 * Phase 7 — D7 SaaS Billing Webhooks wave (docs/saas/DECISIONS.md P7-D3).
 * Owns POST /webhooks/billing (Signed — provider signature, not JWT).
 * Deliberately separate from `PaymentsController`'s POST /payments/webhook
 * (commerce) — frozen SaaS invariant 6 / P7-D3 Part B: SaaS subscription
 * billing and merchant commerce payments are separate, never sharing a
 * route, a table, or a secret.
 *
 * `req.rawBody` is available with no extra configuration — `main.ts` sets
 * `rawBody: true` as a GLOBAL Nest option, not per-route.
 *
 * `x-billing-signature` is a placeholder header name — no real vendor is
 * selected yet (production billing provider selection, P7-D1 Part G,
 * remains OPEN); whichever vendor is eventually chosen may use a
 * differently-named header, at which point only this one `@Headers(...)`
 * argument needs to change. `FakeBillingProvider.verifyWebhook()` accepts
 * any non-empty signature unconditionally — this route's own job is only
 * to require SOME signature be present and hand it to `BillingProvider`
 * for verification, never to interpret it itself.
 */
@Controller('webhooks/billing')
export class BillingWebhooksController {
  constructor(
    private readonly ingestionService: BillingWebhookIngestionService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-billing-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing webhook body or signature');
    }
    await this.ingestionService.receiveWebhook(req.rawBody, signature);
    return { received: true };
  }
}
