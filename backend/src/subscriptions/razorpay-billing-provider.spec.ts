import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { RazorpayBillingProvider } from './razorpay-billing-provider';
import {
  BillingProviderRejectedError,
  BillingProviderTimeoutError,
} from './billing-provider.errors';

/**
 * Unit tests for the production Razorpay SaaS billing adapter
 * (docs/saas/DECISIONS.md P7-D4/P7-D5). Same convention
 * `razorpay.service.spec.ts` (merchant commerce) already establishes: the
 * mock Razorpay SDK client is injected directly onto the private `client`
 * field, bypassing `onModuleInit()`'s real `new Razorpay(...)` — no real
 * network call, no real credentials, deterministic.
 *
 * `verifyWebhook`/`parseWebhook` tests use `Razorpay.validateWebhookSignature`
 * for real (a pure crypto function, no network) — computing a genuinely
 * valid HMAC in-test rather than mocking the SDK's own verification.
 */
describe('RazorpayBillingProvider', () => {
  const SAAS_KEY_ID = 'rzp_test_saas_x';
  const SAAS_KEY_SECRET = 'saas-key-secret-value';
  const SAAS_WEBHOOK_SECRET = 'saas-webhook-secret-value';

  function makeConfig(overrides: Partial<Record<string, string>> = {}) {
    const values = {
      keyId: SAAS_KEY_ID,
      keySecret: SAAS_KEY_SECRET,
      webhookSecret: SAAS_WEBHOOK_SECRET,
      ...overrides,
    };
    return { get: () => values } as unknown as ConfigService;
  }

  function makeClient(overrides: Record<string, unknown> = {}) {
    return {
      customers: { create: jest.fn() },
      plans: { fetch: jest.fn() },
      subscriptions: {
        create: jest.fn(),
        fetch: jest.fn(),
        update: jest.fn(),
        cancel: jest.fn(),
        resume: jest.fn(),
        pause: jest.fn(),
        cancelScheduledChanges: jest.fn(),
      },
      ...overrides,
    };
  }

  /** Constructs a provider with the real config path but a mock SDK
   * client injected directly — never calls `onModuleInit()`'s real
   * `new Razorpay(...)`. */
  function buildProvider(
    client: ReturnType<typeof makeClient> | undefined,
    config: ConfigService = makeConfig(),
  ): RazorpayBillingProvider {
    const provider = new RazorpayBillingProvider(config as never);
    (provider as unknown as { client: unknown }).client = client;
    return provider;
  }

  function sign(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  const NOW_UNIX = 1_780_000_000; // arbitrary fixed Unix seconds
  const END_UNIX = NOW_UNIX + 30 * 24 * 60 * 60;

  // ─── A. Credentials / config validation ──────────────────────────────

  describe('credentials/config validation', () => {
    it('onModuleInit does not throw when SaaS keys are unset — boot must not crash', () => {
      const provider = new RazorpayBillingProvider(
        makeConfig({ keyId: '', keySecret: '' }) as never,
      );
      expect(() => provider.onModuleInit()).not.toThrow();
    });

    it('a method call before configuration throws a clear error naming the required env vars, never a secret value', async () => {
      const provider = new RazorpayBillingProvider(
        makeConfig({ keyId: '', keySecret: '' }) as never,
      );
      provider.onModuleInit();

      await expect(provider.getSubscription('sub_1')).rejects.toThrow(
        /RAZORPAY_SAAS_KEY_ID.*RAZORPAY_SAAS_KEY_SECRET/,
      );
    });

    it('verifyWebhook throws when the webhook secret is not configured, never logging the (absent) secret', () => {
      const provider = buildProvider(
        makeClient(),
        makeConfig({ webhookSecret: '' }),
      );
      expect(() => provider.verifyWebhook(Buffer.from('{}'), 'sig')).toThrow(
        /RAZORPAY_SAAS_WEBHOOK_SECRET/,
      );
    });

    it('the "not configured" error never includes the (absent) secret value itself', async () => {
      const provider = new RazorpayBillingProvider(
        makeConfig({ keyId: '', keySecret: '' }) as never,
      );
      provider.onModuleInit();

      await expect(provider.getSubscription('sub_1')).rejects.not.toThrow(
        SAAS_KEY_SECRET,
      );
    });

    it('a classified provider error never includes the configured secret values, only the vendor-supplied description', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockRejectedValue({
        statusCode: 400,
        error: { description: 'plan not found' },
      });
      const provider = buildProvider(client);

      try {
        await provider.getSubscription('sub_1');
        throw new Error('expected getSubscription to reject');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain(SAAS_KEY_SECRET);
        expect(message).not.toContain(SAAS_WEBHOOK_SECRET);
      }
    });
  });

  // ─── B. createCustomer ────────────────────────────────────────────────

  describe('createCustomer', () => {
    it('maps the Razorpay customer id to providerCustomerId', async () => {
      const client = makeClient();
      client.customers.create.mockResolvedValue({
        id: 'cust_abc123',
      });
      const provider = buildProvider(client);

      const result = await provider.createCustomer('tenant-1');

      expect(result).toEqual({ providerCustomerId: 'cust_abc123' });
      expect(client.customers.create).toHaveBeenCalledWith({
        notes: { tenantId: 'tenant-1' },
      });
    });

    it('a rejected create throws a classified BillingProvider error, not a raw SDK error', async () => {
      const client = makeClient();
      client.customers.create.mockRejectedValue({
        statusCode: 400,
        error: { description: 'bad request' },
      });
      const provider = buildProvider(client);

      await expect(provider.createCustomer('tenant-1')).rejects.toBeInstanceOf(
        BillingProviderRejectedError,
      );
    });
  });

  // ─── C. createSubscription ────────────────────────────────────────────

  describe('createSubscription', () => {
    it('fetches the plan first and creates the subscription with a computed long-horizon total_count', async () => {
      const client = makeClient();
      client.plans.fetch.mockResolvedValue({
        id: 'plan_1',
        period: 'monthly',
        interval: 1,
      });
      client.subscriptions.create.mockResolvedValue({
        id: 'sub_new',
        plan_id: 'plan_1',
        status: 'created',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      const result = await provider.createSubscription('cust_1', 'plan_1');

      expect(client.plans.fetch).toHaveBeenCalledWith('plan_1');
      expect(client.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ plan_id: 'plan_1', total_count: 240 }), // 12/yr * 20yr / interval 1
      );
      expect(result.providerSubscriptionId).toBe('sub_new');
    });

    it.each([
      ['monthly', 1, 240],
      ['yearly', 1, 20],
      ['weekly', 1, 1040],
      ['daily', 1, 7300],
      ['monthly', 3, 80], // quarterly billing (interval 3)
    ])(
      'computes total_count for period=%s interval=%i as %i (a ~20-year horizon)',
      async (period, interval, expected) => {
        const client = makeClient();
        client.plans.fetch.mockResolvedValue({
          id: 'plan_1',
          period,
          interval,
        });
        client.subscriptions.create.mockResolvedValue({
          id: 'sub_new',
          plan_id: 'plan_1',
          current_start: NOW_UNIX,
          current_end: END_UNIX,
        });
        const provider = buildProvider(client);

        await provider.createSubscription('cust_1', 'plan_1');

        expect(client.subscriptions.create).toHaveBeenCalledWith(
          expect.objectContaining({ total_count: expected }),
        );
      },
    );

    it('never forwards providerCustomerId to Razorpay — the create body carries no customer_id field at all', async () => {
      const client = makeClient();
      client.plans.fetch.mockResolvedValue({
        id: 'plan_1',
        period: 'monthly',
        interval: 1,
      });
      client.subscriptions.create.mockResolvedValue({
        id: 'sub_new',
        plan_id: 'plan_1',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      await provider.createSubscription('cust_should_not_appear', 'plan_1');

      const [call] = client.subscriptions.create.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(call).not.toHaveProperty('customer_id');
    });

    it('throws (never fabricates a period) when the newly-created subscription has no confirmed billing period yet', async () => {
      const client = makeClient();
      client.plans.fetch.mockResolvedValue({
        id: 'plan_1',
        period: 'monthly',
        interval: 1,
      });
      client.subscriptions.create.mockResolvedValue({
        id: 'sub_new',
        plan_id: 'plan_1',
        status: 'created', // not yet authorized — no period exists
        current_start: null,
        current_end: null,
      });
      const provider = buildProvider(client);

      await expect(
        provider.createSubscription('cust_1', 'plan_1'),
      ).rejects.toThrow(/no provider-confirmed billing period/);
    });
  });

  // ─── D. changeSubscription ────────────────────────────────────────────

  describe('changeSubscription', () => {
    it("mode 'immediate' maps to schedule_change_at: 'now'", async () => {
      const client = makeClient();
      client.subscriptions.update.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_2',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      await provider.changeSubscription('sub_1', 'plan_2', 'immediate');

      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        plan_id: 'plan_2',
        schedule_change_at: 'now',
      });
    });

    it("mode 'at_period_end' maps to schedule_change_at: 'cycle_end'", async () => {
      const client = makeClient();
      client.subscriptions.update.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_2',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      await provider.changeSubscription('sub_1', 'plan_2', 'at_period_end');

      expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        plan_id: 'plan_2',
        schedule_change_at: 'cycle_end',
      });
    });

    it('performs a follow-up fetch when the update response lacks period data — never invents dates', async () => {
      const client = makeClient();
      client.subscriptions.update.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_2',
        current_start: null,
        current_end: null,
      });
      client.subscriptions.fetch.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_2',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      const result = await provider.changeSubscription(
        'sub_1',
        'plan_2',
        'immediate',
      );

      expect(client.subscriptions.fetch).toHaveBeenCalledWith('sub_1');
      expect(result.currentPeriodStart).toEqual(new Date(NOW_UNIX * 1000));
    });

    it('does NOT perform a follow-up fetch when the update response already carries complete period data', async () => {
      const client = makeClient();
      client.subscriptions.update.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_2',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      await provider.changeSubscription('sub_1', 'plan_2', 'immediate');

      expect(client.subscriptions.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── E/F. cancelSubscription ──────────────────────────────────────────

  describe('cancelSubscription — immediate', () => {
    it('calls cancel(id, false)', async () => {
      const client = makeClient();
      client.subscriptions.cancel.mockResolvedValue({
        id: 'sub_1',
        status: 'cancelled',
      });
      const provider = buildProvider(client);

      await provider.cancelSubscription('sub_1', 'immediate');

      expect(client.subscriptions.cancel).toHaveBeenCalledWith('sub_1', false);
    });
  });

  describe('cancelSubscription — at_period_end (docs/saas/DECISIONS.md P7-D5 Part B)', () => {
    it('makes NO Razorpay API call of any kind', async () => {
      const client = makeClient();
      const provider = buildProvider(client);

      await provider.cancelSubscription('sub_1', 'at_period_end');

      expect(client.subscriptions.cancel).not.toHaveBeenCalled();
      expect(client.subscriptions.update).not.toHaveBeenCalled();
      expect(client.subscriptions.pause).not.toHaveBeenCalled();
      expect(
        client.subscriptions.cancelScheduledChanges,
      ).not.toHaveBeenCalled();
    });

    it('resolves successfully even with no client configured — genuinely a pure no-op', async () => {
      const provider = buildProvider(undefined);
      await expect(
        provider.cancelSubscription('sub_1', 'at_period_end'),
      ).resolves.toBeUndefined();
    });
  });

  // ─── G. unscheduleCancellation (P7-D5 Part C) ────────────────────────

  describe('unscheduleCancellation (docs/saas/DECISIONS.md P7-D5 Part C)', () => {
    it('makes NO destructive provider call — only a read-only fetch', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_1',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      await provider.unscheduleCancellation('sub_1');

      expect(client.subscriptions.fetch).toHaveBeenCalledWith('sub_1');
      expect(client.subscriptions.cancel).not.toHaveBeenCalled();
      expect(client.subscriptions.resume).not.toHaveBeenCalled();
      expect(
        client.subscriptions.cancelScheduledChanges,
      ).not.toHaveBeenCalled();
    });

    it('returns real, provider-confirmed data — never fabricated', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_1',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      const result = await provider.unscheduleCancellation('sub_1');

      expect(result.currentPeriodStart).toEqual(new Date(NOW_UNIX * 1000));
      expect(result.currentPeriodEnd).toEqual(new Date(END_UNIX * 1000));
    });
  });

  // ─── H. resumeSubscription ────────────────────────────────────────────

  describe('resumeSubscription', () => {
    it('calls resume with resume_at: now', async () => {
      const client = makeClient();
      client.subscriptions.resume.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_1',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      await provider.resumeSubscription('sub_1');

      expect(client.subscriptions.resume).toHaveBeenCalledWith('sub_1', {
        resume_at: 'now',
      });
    });
  });

  // ─── I. getSubscription ───────────────────────────────────────────────

  describe('getSubscription', () => {
    it('calls fetch and normalizes the result', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_1',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      const result = await provider.getSubscription('sub_1');

      expect(result).toEqual({
        providerSubscriptionId: 'sub_1',
        currentPeriodStart: new Date(NOW_UNIX * 1000),
        currentPeriodEnd: new Date(END_UNIX * 1000),
        planRef: 'plan_1',
      });
    });
  });

  // ─── J/K. Error translation ───────────────────────────────────────────

  describe('error translation', () => {
    it('a 4xx business error throws BillingProviderRejectedError with the provider-safe description', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockRejectedValue({
        statusCode: 400,
        error: { code: 'BAD_REQUEST_ERROR', description: 'plan not found' },
      });
      const provider = buildProvider(client);

      await expect(provider.getSubscription('sub_1')).rejects.toMatchObject({
        constructor: BillingProviderRejectedError,
        message: 'plan not found',
      });
    });

    it('a 5xx server error is treated as ambiguous (timeout), never a business rejection', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockRejectedValue({
        statusCode: 502,
        error: { description: 'upstream error' },
      });
      const provider = buildProvider(client);

      await expect(provider.getSubscription('sub_1')).rejects.toBeInstanceOf(
        BillingProviderTimeoutError,
      );
    });

    it('a transport failure with no statusCode throws BillingProviderTimeoutError', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = buildProvider(client);

      await expect(provider.getSubscription('sub_1')).rejects.toBeInstanceOf(
        BillingProviderTimeoutError,
      );
    });

    it("the SDK's own mangled TypeError (reading 'status') is classified as a timeout, never crashes past this boundary", async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockRejectedValue(
        new TypeError("Cannot read properties of undefined (reading 'status')"),
      );
      const provider = buildProvider(client);

      await expect(provider.getSubscription('sub_1')).rejects.toBeInstanceOf(
        BillingProviderTimeoutError,
      );
    });

    it('never exposes the raw Razorpay error object — only a safe, classified message', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockRejectedValue({
        statusCode: 400,
        error: {
          description: 'plan not found',
          internal_secret: 'should-never-leak',
        },
      });
      const provider = buildProvider(client);

      try {
        await provider.getSubscription('sub_1');
        throw new Error('expected getSubscription to reject');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain('should-never-leak');
        expect(err).not.toHaveProperty('internal_secret');
      }
    });
  });

  // ─── L/M. Response normalization ──────────────────────────────────────

  describe('response normalization', () => {
    it('converts Unix-seconds current_start/current_end into Date objects', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_1',
        current_start: NOW_UNIX,
        current_end: END_UNIX,
      });
      const provider = buildProvider(client);

      const result = await provider.getSubscription('sub_1');

      expect(result.currentPeriodStart.getTime()).toBe(NOW_UNIX * 1000);
      expect(result.currentPeriodEnd.getTime()).toBe(END_UNIX * 1000);
    });

    it('throws rather than inventing a period when current_start/current_end are null', async () => {
      const client = makeClient();
      client.subscriptions.fetch.mockResolvedValue({
        id: 'sub_1',
        plan_id: 'plan_1',
        status: 'created',
        current_start: null,
        current_end: null,
      });
      const provider = buildProvider(client);

      await expect(provider.getSubscription('sub_1')).rejects.toThrow(
        /no provider-confirmed billing period/,
      );
    });
  });

  // ─── N/O. Webhook signature verification ──────────────────────────────

  describe('verifyWebhook', () => {
    it('a genuinely valid HMAC-SHA256 signature over the exact raw body returns true', () => {
      const provider = buildProvider(makeClient());
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'subscription.charged' }),
      );
      const signature = sign(rawBody.toString('utf8'), SAAS_WEBHOOK_SECRET);

      expect(provider.verifyWebhook(rawBody, signature)).toBe(true);
    });

    it('an invalid signature returns false — fails closed', () => {
      const provider = buildProvider(makeClient());
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'subscription.charged' }),
      );

      expect(provider.verifyWebhook(rawBody, 'not-the-real-signature')).toBe(
        false,
      );
    });

    it('a signature computed over a DIFFERENT body than the one presented returns false (proves the raw body is what is actually verified, not a re-stringified copy)', () => {
      const provider = buildProvider(makeClient());
      const signedBody = JSON.stringify({ event: 'subscription.charged' });
      const tamperedBody = Buffer.from(
        JSON.stringify({ event: 'subscription.cancelled' }),
      );
      const signature = sign(signedBody, SAAS_WEBHOOK_SECRET);

      expect(provider.verifyWebhook(tamperedBody, signature)).toBe(false);
    });

    it('an empty signature returns false without throwing', () => {
      const provider = buildProvider(makeClient());
      expect(provider.verifyWebhook(Buffer.from('{}'), '')).toBe(false);
    });
  });

  // ─── P–W. parseWebhook ─────────────────────────────────────────────────

  describe('parseWebhook', () => {
    function payload(event: string, entity: Record<string, unknown> = {}) {
      return Buffer.from(
        JSON.stringify({
          event,
          account_id: 'acc_1',
          created_at: NOW_UNIX,
          contains: ['subscription'],
          payload: {
            subscription: {
              entity: {
                id: 'sub_1',
                customer_id: 'cust_1',
                ...entity,
              },
            },
          },
        }),
      );
    }

    it('uses X-Razorpay-Event-Id (header) as providerEventId when present — never derived from the payload', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(
        payload('subscription.cancelled'),
        'evt_from_header',
      );
      expect(result.providerEventId).toBe('evt_from_header');
    });

    it('falls back to a payload-derived id ONLY when the header is absent', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(payload('subscription.cancelled'));
      expect(result.providerEventId).toBe(
        `subscription.cancelled:sub_1:${NOW_UNIX}`,
      );
    });

    it('an empty-string header is treated as absent, not as a real id', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(
        payload('subscription.cancelled'),
        '   ',
      );
      expect(result.providerEventId).not.toBe('   ');
    });

    it('maps subscription.pending to the canonical payment_failed type', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(payload('subscription.pending'));
      expect(result.type).toBe('payment_failed');
    });

    it('maps subscription.charged to the canonical renewed type, with period boundaries from current_start/current_end', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(
        payload('subscription.charged', {
          current_start: NOW_UNIX,
          current_end: END_UNIX,
        }),
      );
      expect(result.type).toBe('renewed');
      const p = result.payload as Record<string, unknown>;
      expect(p.currentPeriodStart).toBe(
        new Date(NOW_UNIX * 1000).toISOString(),
      );
      expect(p.currentPeriodEnd).toBe(new Date(END_UNIX * 1000).toISOString());
    });

    it('maps subscription.cancelled to the canonical cancelled type', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(payload('subscription.cancelled'));
      expect(result.type).toBe('cancelled');
    });

    it.each([
      'subscription.activated',
      'subscription.authenticated',
      'subscription.halted',
      'subscription.completed',
      'subscription.paused',
      'subscription.resumed',
      'subscription.updated',
    ])(
      '%s passes through unchanged (recognized by neither applyBillingWebhookEvent nor the renewal special-case — safe no-op upstream)',
      (razorpayEvent) => {
        const provider = buildProvider(makeClient());
        const result = provider.parseWebhook(payload(razorpayEvent));
        expect(result.type).toBe(razorpayEvent);
      },
    );

    it('never attaches period-boundary fields to a non-renewal event', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(
        payload('subscription.cancelled', {
          current_start: NOW_UNIX,
          current_end: END_UNIX,
        }),
      );
      const p = result.payload as Record<string, unknown>;
      expect(p).not.toHaveProperty('currentPeriodStart');
      expect(p).not.toHaveProperty('currentPeriodEnd');
    });

    it('extracts providerSubscriptionId and providerCustomerId from the entity', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(payload('subscription.cancelled'));
      const p = result.payload as Record<string, unknown>;
      expect(p.providerSubscriptionId).toBe('sub_1');
      expect(p.providerCustomerId).toBe('cust_1');
    });

    it('converts the top-level created_at (Unix seconds) into an ISO occurredAt', () => {
      const provider = buildProvider(makeClient());
      const result = provider.parseWebhook(payload('subscription.cancelled'));
      const p = result.payload as Record<string, unknown>;
      expect(p.occurredAt).toBe(new Date(NOW_UNIX * 1000).toISOString());
    });

    it('throws on a malformed (non-JSON) body', () => {
      const provider = buildProvider(makeClient());
      expect(() =>
        provider.parseWebhook(Buffer.from('not json at all')),
      ).toThrow(/Malformed Razorpay webhook payload/);
    });
  });
});
