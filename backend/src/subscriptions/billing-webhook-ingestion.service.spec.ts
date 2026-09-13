import { BadRequestException } from '@nestjs/common';
import { BillingWebhookIngestionService } from './billing-webhook-ingestion.service';

/**
 * Phase 7 — D7 SaaS Billing Webhooks wave. Unit tests against a mocked
 * `BillingProvider`/`PrismaService` — same convention as every other
 * `*.service.spec.ts` in this repo. Real-Postgres dedup/race proof lives
 * in `test/e2e/billing-webhooks.e2e-spec.ts`.
 */
describe('BillingWebhookIngestionService', () => {
  function makeDeps(
    opts: { verifyResult?: boolean; parseResult?: unknown } = {},
  ) {
    const queryRaw = jest.fn().mockResolvedValue(undefined);
    const prisma = { $queryRaw: queryRaw };
    const billingProvider = {
      verifyWebhook: jest.fn().mockReturnValue(opts.verifyResult ?? true),
      parseWebhook: jest.fn().mockReturnValue(
        opts.parseResult ?? {
          providerEventId: 'evt-1',
          type: 'payment_failed',
          payload: {},
        },
      ),
    };
    return { prisma, billingProvider, queryRaw };
  }

  function makeService(deps: ReturnType<typeof makeDeps>) {
    return new BillingWebhookIngestionService(
      deps.prisma as never,
      deps.billingProvider as never,
    );
  }

  it('verifies the signature before doing anything else', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.receiveWebhook(Buffer.from('body'), 'sig-1');

    expect(deps.billingProvider.verifyWebhook).toHaveBeenCalledWith(
      Buffer.from('body'),
      'sig-1',
    );
  });

  it('an invalid signature is rejected with 400 and writes nothing to the database', async () => {
    const deps = makeDeps({ verifyResult: false });
    const service = makeService(deps);

    await expect(
      service.receiveWebhook(Buffer.from('body'), 'bad-sig'),
    ).rejects.toThrow(BadRequestException);
    expect(deps.queryRaw).not.toHaveBeenCalled();
  });

  it('a parseWebhook throw (malformed payload) is rejected with 400 and writes nothing', async () => {
    const deps = makeDeps();
    deps.billingProvider.parseWebhook.mockImplementation(() => {
      throw new Error('malformed');
    });
    const service = makeService(deps);

    await expect(
      service.receiveWebhook(Buffer.from('body'), 'sig-1'),
    ).rejects.toThrow(BadRequestException);
    expect(deps.queryRaw).not.toHaveBeenCalled();
  });

  it('a parsed event missing providerEventId is rejected with 400 and writes nothing', async () => {
    const deps = makeDeps({
      parseResult: { providerEventId: '', type: 'payment_failed', payload: {} },
    });
    const service = makeService(deps);

    await expect(
      service.receiveWebhook(Buffer.from('body'), 'sig-1'),
    ).rejects.toThrow(BadRequestException);
    expect(deps.queryRaw).not.toHaveBeenCalled();
  });

  it('a valid, verified event is persisted via a single INSERT ... ON CONFLICT DO NOTHING call', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.receiveWebhook(Buffer.from('body'), 'sig-1');

    expect(deps.queryRaw).toHaveBeenCalledTimes(1);
  });
});
