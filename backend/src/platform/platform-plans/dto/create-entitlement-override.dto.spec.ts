import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEntitlementOverrideDto } from './create-entitlement-override.dto';

/** Mirrors main.ts's global ValidationPipe options exactly. Field-shape
 * validation only — the exactly-one-of-featureKey/limitKey cross-field
 * invariant, and the correct-value-field-for-key-type rule, are enforced
 * by `PlatformPlansService` (see platform-plans.service.spec.ts), not by
 * this DTO's own decorators. */
async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(CreateEntitlementOverrideDto, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('CreateEntitlementOverrideDto validation', () => {
  it('accepts a valid feature override payload', async () => {
    const errors = await validateDto({
      featureKey: 'coupons',
      boolValue: true,
      reason: 'pilot customer grant',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid limit override payload with intValue: null (unlimited)', async () => {
    const errors = await validateDto({
      limitKey: 'products',
      intValue: null,
      reason: 'pilot customer grant',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid limit override payload with a non-negative intValue', async () => {
    const errors = await validateDto({
      limitKey: 'products',
      intValue: 500,
      reason: 'pilot customer grant',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a blank reason', async () => {
    const errors = await validateDto({
      featureKey: 'coupons',
      boolValue: true,
      reason: '',
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects an omitted reason', async () => {
    const errors = await validateDto({
      featureKey: 'coupons',
      boolValue: true,
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects a reason exceeding 500 characters', async () => {
    const errors = await validateDto({
      featureKey: 'coupons',
      boolValue: true,
      reason: 'a'.repeat(501),
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects a negative intValue', async () => {
    const errors = await validateDto({
      limitKey: 'products',
      intValue: -1,
      reason: 'x',
    });
    expect(errors.some((e) => e.property === 'intValue')).toBe(true);
  });

  it('rejects a non-integer intValue', async () => {
    const errors = await validateDto({
      limitKey: 'products',
      intValue: 1.5,
      reason: 'x',
    });
    expect(errors.some((e) => e.property === 'intValue')).toBe(true);
  });

  it('rejects a non-boolean boolValue', async () => {
    const errors = await validateDto({
      featureKey: 'coupons',
      boolValue: 'yes',
      reason: 'x',
    });
    expect(errors.some((e) => e.property === 'boolValue')).toBe(true);
  });

  it('rejects an unknown field', async () => {
    const errors = await validateDto({
      featureKey: 'coupons',
      boolValue: true,
      reason: 'x',
      expiresAt: '2027-01-01',
    });
    expect(errors.some((e) => e.property === 'expiresAt')).toBe(true);
  });
});
