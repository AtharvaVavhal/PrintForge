jest.mock('@sentry/node');
import * as Sentry from '@sentry/node';
import { WebhookProcessor } from './webhook-processor.service';
import { PaymentMismatchError } from '../payment-mismatch.error';

const captureException = Sentry.captureException as jest.Mock;

interface UpdateData {
  status?: string;
  attempts?: number;
  lastError?: string;
  availableAt?: Date;
  processedAt?: Date;
}

/**
 * Phase 13.3 §3 — bounded webhook retry. Verifies the attempt counter,
 * increasing backoff, terminal dead-letter + Sentry, non-retryable
 * mismatch handling, and that a successful/duplicate-race event never
 * retries. The real transactional processing is exercised end-to-end in
 * test/e2e/webhook-retry.e2e-spec.ts.
 */
describe('WebhookProcessor — bounded retry', () => {
  const PAYLOAD = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x' } } },
  };

  function build(rowAttempts: number) {
    const txUpdates: UpdateData[] = [];
    const outerUpdates: UpdateData[] = [];
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { id: 'wh-1', payload: PAYLOAD, attempts: rowAttempts },
        ]),
      webhookEvent: {
        update: jest.fn((args: { data: UpdateData }) => {
          txUpdates.push(args.data);
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
      webhookEvent: {
        update: jest.fn((args: { data: UpdateData }) => {
          outerUpdates.push(args.data);
          return Promise.resolve({});
        }),
        findMany: jest.fn().mockResolvedValue([{ id: 'wh-1' }]),
      },
    };
    const paymentsService = {
      applyWebhookEvent: jest.fn(),
      isUniqueConstraintViolation: jest.fn().mockReturnValue(false),
    };
    const processor = new WebhookProcessor(
      prisma as never,
      paymentsService as never,
    );
    return { processor, paymentsService, txUpdates, outerUpdates };
  }

  beforeEach(() => {
    captureException.mockClear();
  });

  it('a processing failure increments attempts, sets PROCESSING_FAILED and a ~30s backoff', async () => {
    const { processor, paymentsService, outerUpdates } = build(0);
    paymentsService.applyWebhookEvent.mockRejectedValue(new Error('boom'));

    await processor.processReceivedWebhooks();

    expect(outerUpdates).toHaveLength(1);
    const data = outerUpdates[0];
    expect(data.status).toBe('PROCESSING_FAILED');
    expect(data.attempts).toBe(1);
    expect(data.lastError).toBe('boom');
    const delayMs = (data.availableAt as Date).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(20_000);
    expect(delayMs).toBeLessThan(40_000);
  });

  it('the retry delay increases with the attempt count', async () => {
    const { processor, paymentsService, outerUpdates } = build(2); // -> attempt 3
    paymentsService.applyWebhookEvent.mockRejectedValue(
      new Error('still down'),
    );

    await processor.processReceivedWebhooks();

    expect(outerUpdates[0].attempts).toBe(3);
    const delayMs =
      (outerUpdates[0].availableAt as Date).getTime() - Date.now();
    // BACKOFF_MS[2] = 600_000 (10m)
    expect(delayMs).toBeGreaterThan(9 * 60_000);
    expect(delayMs).toBeLessThan(11 * 60_000);
  });

  it('stops retrying after the maximum attempts — terminal FAILED + Sentry error', async () => {
    const { processor, paymentsService, outerUpdates } = build(5); // -> attempt 6 = MAX
    paymentsService.applyWebhookEvent.mockRejectedValue(new Error('permanent'));

    await processor.processReceivedWebhooks();

    expect(outerUpdates[0].status).toBe('FAILED');
    expect(outerUpdates[0].attempts).toBe(6);
    expect(outerUpdates[0].processedAt).toBeInstanceOf(Date);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('a payment mismatch is non-retryable — immediate FAILED + Sentry, order untouched', async () => {
    const { processor, paymentsService, outerUpdates } = build(0);
    paymentsService.applyWebhookEvent.mockRejectedValue(
      new PaymentMismatchError('AMOUNT_MISMATCH', 'expected 15000, got 100'),
    );

    await processor.processReceivedWebhooks();

    expect(outerUpdates[0].status).toBe('FAILED');
    expect(outerUpdates[0].attempts).toBe(1);
    expect(outerUpdates[0].lastError).toMatch(/AMOUNT_MISMATCH/);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('a successfully processed event is marked PROCESSED and never retried', async () => {
    const { processor, paymentsService, txUpdates, outerUpdates } = build(0);
    paymentsService.applyWebhookEvent.mockResolvedValue('PROCESSED');

    await processor.processReceivedWebhooks();

    expect(txUpdates[0].status).toBe('PROCESSED');
    expect(txUpdates[0].processedAt).toBeInstanceOf(Date);
    expect(outerUpdates).toHaveLength(0); // no out-of-transaction retry write
  });

  it('a concurrent-capture P2002 is a no-op success (PROCESSED), not a retry', async () => {
    const { processor, paymentsService, outerUpdates } = build(1);
    const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
    paymentsService.applyWebhookEvent.mockRejectedValue(p2002);
    paymentsService.isUniqueConstraintViolation.mockReturnValue(true);

    await processor.processReceivedWebhooks();

    expect(outerUpdates[0].status).toBe('PROCESSED');
    expect(captureException).not.toHaveBeenCalled();
  });
});
