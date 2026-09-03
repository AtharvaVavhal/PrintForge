import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, authHeader, http, registerUser } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * `GET /postal-codes/:postalCode` against the real running app, with the
 * outbound provider call stubbed at `global.fetch` (same "spy the external
 * boundary per-test" approach the suite already uses for EmailService).
 * No real network call to api.pincodeapi.in — CI-safe and deterministic.
 */
describe('Postal code lookup (Checkout Contact & PIN Validation)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fetchSpy: jest.SpyInstance;

  const PROVIDER_OK = {
    success: true,
    data: {
      pincode: '411046',
      post_offices: [
        {
          office_name: 'Katraj S.O',
          office_slug: 'katraj-s-o',
          district: 'Pune',
          state: 'Maharashtra',
          circle: 'Maharashtra Circle',
          latitude: 18.446,
          digipin: '4FP4526LCL',
        },
      ],
    },
  };

  function providerReply(body: unknown, status = 200): Promise<Response> {
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('requires authentication', async () => {
    fetchSpy.mockImplementation(() => providerReply(PROVIDER_OK));
    await http(app).get(apiPath('/postal-codes/411046')).expect(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a normalised location for a valid PIN', async () => {
    const user = await registerUser(app);
    fetchSpy.mockImplementation(() => providerReply(PROVIDER_OK));

    const res = await http(app)
      .get(apiPath('/postal-codes/411046'))
      .set(...authHeader(user))
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      data: {
        postalCode: '411046',
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        country: 'India',
      },
    });
  });

  it('never leaks provider internals in the response', async () => {
    const user = await registerUser(app);
    fetchSpy.mockImplementation(() => providerReply(PROVIDER_OK));

    const res = await http(app)
      .get(apiPath('/postal-codes/411046'))
      .set(...authHeader(user))
      .expect(200);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/slug|office_name|digipin|latitude|circle/i);
  });

  it('rejects a malformed PIN with 400 before any outbound call', async () => {
    const user = await registerUser(app);
    fetchSpy.mockImplementation(() => providerReply(PROVIDER_OK));

    const res = await http(app)
      .get(apiPath('/postal-codes/12345'))
      .set(...authHeader(user))
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Enter a valid 6-digit PIN code.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a provider 404 to a 404 with a friendly message', async () => {
    const user = await registerUser(app);
    fetchSpy.mockImplementation(() =>
      providerReply({ code: 'PINCODE_NOT_FOUND' }, 404),
    );

    const res = await http(app)
      .get(apiPath('/postal-codes/999999'))
      .set(...authHeader(user))
      .expect(404);

    expect(res.body.error.message).toBe(
      "We couldn't find this PIN code. Please check it and try again.",
    );
  });

  it('maps a provider outage to a 503 the frontend can fall back from', async () => {
    const user = await registerUser(app);
    fetchSpy.mockImplementation(() => providerReply({ detail: 'boom' }, 503));

    const res = await http(app)
      .get(apiPath('/postal-codes/560001'))
      .set(...authHeader(user))
      .expect(503);

    expect(res.body.error.message).toBe(
      "We couldn't verify this PIN right now. Please check your PIN or enter your address manually.",
    );
  });

  it('maps a network failure to a 503', async () => {
    const user = await registerUser(app);
    fetchSpy.mockImplementation(() =>
      Promise.reject(new DOMException('timed out', 'TimeoutError')),
    );

    await http(app)
      .get(apiPath('/postal-codes/560001'))
      .set(...authHeader(user))
      .expect(503);
  });
});

describe('Checkout order creation — phone & PIN validation', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const badBody = (overrides: Record<string, unknown>) => ({
    shippingRecipientName: 'Jane Doe',
    shippingPhone: '9876543210',
    shippingAddressLine1: '123 MG Road',
    shippingCity: 'Pune',
    shippingState: 'Maharashtra',
    shippingPostalCode: '411046',
    shippingCountry: 'India',
    ...overrides,
  });

  it('rejects a checkout with a malformed phone number (400)', async () => {
    const user = await registerUser(app);
    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `bad-phone-${user.id}`)
      .send(badBody({ shippingPhone: '12345' }))
      .expect(400);
    expect(JSON.stringify(res.body.error.details)).toContain('shippingPhone');
  });

  it('rejects a checkout with a non-6-digit PIN (400)', async () => {
    const user = await registerUser(app);
    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `bad-pin-${user.id}`)
      .send(badBody({ shippingPostalCode: '4110' }))
      .expect(400);
    expect(JSON.stringify(res.body.error.details)).toContain(
      'shippingPostalCode',
    );
  });
});
