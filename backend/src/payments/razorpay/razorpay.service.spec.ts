import { ConfigService } from '@nestjs/config';
import { RazorpayApiError, RazorpayService } from './razorpay.service';

/**
 * Focused on the SDK-error translation added after the checkout 500
 * (`TypeError: Cannot read properties of undefined (reading 'status')`
 * thrown by razorpay@2.9.8's `normalizeError` on any response-less
 * transport failure). The happy path and the "not configured" path are
 * also covered end-to-end in test/e2e — here we only need the mapping.
 *
 * The client is injected directly (`onModuleInit` builds the real SDK
 * client from env, which we don't want in a unit test).
 */
describe('RazorpayService — SDK error translation', () => {
  const config = {
    get: () => ({ keyId: 'rzp_test_x', keySecret: 'secret_x' }),
  } as unknown as ConfigService;

  function buildService(create: jest.Mock) {
    const service = new RazorpayService(config as never);
    (service as unknown as { client: unknown }).client = {
      orders: { create, fetchPayments: jest.fn() },
    };
    return service;
  }

  it('returns the order id on success', async () => {
    const service = buildService(
      jest.fn().mockResolvedValue({ id: 'order_1' }),
    );
    await expect(
      service.createOrder({
        amountPaise: 14900n,
        currency: 'INR',
        receipt: 'r',
      }),
    ).resolves.toEqual({ id: 'order_1' });
  });

  it('passes amount as a decimal string, never a number', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'order_1' });
    const service = buildService(create);
    await service.createOrder({
      amountPaise: 14900n,
      currency: 'INR',
      receipt: 'r',
    });
    expect(create).toHaveBeenCalledWith({
      amount: '14900',
      currency: 'INR',
      receipt: 'r',
    });
  });

  it('translates a real Razorpay API error, preserving the HTTP status', async () => {
    const service = buildService(
      jest.fn().mockRejectedValue({
        statusCode: 400,
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'amount must be at least 100',
        },
      }),
    );
    const err = await service
      .createOrder({ amountPaise: 1n, currency: 'INR', receipt: 'r' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RazorpayApiError);
    expect((err as RazorpayApiError).statusCode).toBe(400);
    expect((err as RazorpayApiError).transport).toBe(false);
    expect((err as RazorpayApiError).message).toContain(
      'amount must be at least 100',
    );
  });

  it('translates the SDK’s mangled TypeError (response-less failure) into a clear transport error', async () => {
    const service = buildService(
      jest
        .fn()
        .mockRejectedValue(
          new TypeError(
            "Cannot read properties of undefined (reading 'status')",
          ),
        ),
    );
    const err = await service
      .createOrder({ amountPaise: 14900n, currency: 'INR', receipt: 'r' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RazorpayApiError);
    expect(err).not.toBeInstanceOf(TypeError);
    expect((err as RazorpayApiError).transport).toBe(true);
    expect((err as RazorpayApiError).statusCode).toBeUndefined();
    expect((err as RazorpayApiError).message).toMatch(
      /could not reach Razorpay/i,
    );
  });

  it('translates a raw network error, keeping its code', async () => {
    const service = buildService(
      jest.fn().mockRejectedValue(
        Object.assign(new Error('getaddrinfo ENOTFOUND api.razorpay.com'), {
          code: 'ENOTFOUND',
        }),
      ),
    );
    const err = await service
      .createOrder({ amountPaise: 14900n, currency: 'INR', receipt: 'r' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RazorpayApiError);
    expect((err as RazorpayApiError).transport).toBe(true);
    expect((err as RazorpayApiError).code).toBe('ENOTFOUND');
  });

  it('does not swallow the failure — createOrder always rejects, never returns a fake order', async () => {
    const service = buildService(
      jest.fn().mockRejectedValue(new TypeError("reading 'status'")),
    );
    await expect(
      service.createOrder({
        amountPaise: 14900n,
        currency: 'INR',
        receipt: 'r',
      }),
    ).rejects.toBeInstanceOf(RazorpayApiError);
  });

  it('rejects when the SDK resolves without an order id', async () => {
    const service = buildService(jest.fn().mockResolvedValue({}));
    await expect(
      service.createOrder({
        amountPaise: 14900n,
        currency: 'INR',
        receipt: 'r',
      }),
    ).rejects.toBeInstanceOf(RazorpayApiError);
  });

  it('fails loudly when the client is not configured', async () => {
    const service = new RazorpayService(config as never);
    expect(service.isConfigured()).toBe(false);
    await expect(
      service.createOrder({
        amountPaise: 14900n,
        currency: 'INR',
        receipt: 'r',
      }),
    ).rejects.toThrow(/not configured/i);
  });
});
