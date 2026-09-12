import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetPlanLimitDto } from './set-plan-limit.dto';

/** Mirrors main.ts's global ValidationPipe options exactly (see
 * update-profile.dto.spec.ts for the established convention). Exercises
 * the "REQUIRED but nullable" `@ValidateIf` shape: `limitValue` must always
 * be present, but the literal `null` (meaning unlimited) is a valid value
 * distinct from an omitted/`undefined` one. */
async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(SetPlanLimitDto, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('SetPlanLimitDto validation', () => {
  it('accepts a non-negative integer', async () => {
    const errors = await validateDto({ limitValue: 100 });
    expect(errors).toHaveLength(0);
  });

  it('accepts zero', async () => {
    const errors = await validateDto({ limitValue: 0 });
    expect(errors).toHaveLength(0);
  });

  it('accepts explicit null (unlimited)', async () => {
    const errors = await validateDto({ limitValue: null });
    expect(errors).toHaveLength(0);
  });

  it('rejects an omitted limitValue — this field is required, not optional', async () => {
    const errors = await validateDto({});
    expect(errors.some((e) => e.property === 'limitValue')).toBe(true);
  });

  it('rejects a negative integer', async () => {
    const errors = await validateDto({ limitValue: -1 });
    expect(errors.some((e) => e.property === 'limitValue')).toBe(true);
  });

  it('rejects a non-integer number', async () => {
    const errors = await validateDto({ limitValue: 1.5 });
    expect(errors.some((e) => e.property === 'limitValue')).toBe(true);
  });

  it('rejects a string value', async () => {
    const errors = await validateDto({ limitValue: '100' });
    expect(errors.some((e) => e.property === 'limitValue')).toBe(true);
  });

  it('rejects an unknown field', async () => {
    const errors = await validateDto({
      limitValue: 5,
      period: 'BILLING_PERIOD',
    });
    expect(errors.some((e) => e.property === 'period')).toBe(true);
  });
});
