import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePlanDto } from './create-plan.dto';

/** Mirrors main.ts's global ValidationPipe options exactly. */
async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(CreatePlanDto, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('CreatePlanDto validation', () => {
  it('accepts a minimal valid payload', async () => {
    const errors = await validateDto({ key: 'starter', name: 'Starter' });
    expect(errors).toHaveLength(0);
  });

  it('accepts a full valid payload', async () => {
    const errors = await validateDto({
      key: 'enterprise_custom',
      name: 'Enterprise',
      isPublic: false,
      sortOrder: 10,
      isEnterpriseCustom: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a key starting with a digit', async () => {
    const errors = await validateDto({ key: '1starter', name: 'Starter' });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('rejects a key containing uppercase letters', async () => {
    const errors = await validateDto({ key: 'Starter', name: 'Starter' });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('rejects a key containing a hyphen (only lowercase alnum/underscore allowed)', async () => {
    const errors = await validateDto({ key: 'starter-plan', name: 'Starter' });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('rejects a key exceeding 40 characters', async () => {
    const errors = await validateDto({ key: 'a'.repeat(41), name: 'Starter' });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('rejects an empty key', async () => {
    const errors = await validateDto({ key: '', name: 'Starter' });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('rejects an omitted name', async () => {
    const errors = await validateDto({ key: 'starter' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a negative sortOrder', async () => {
    const errors = await validateDto({
      key: 'starter',
      name: 'Starter',
      sortOrder: -1,
    });
    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });

  it('rejects isActive in the body — plan lifecycle is via dedicated archive/restore routes', async () => {
    const errors = await validateDto({
      key: 'starter',
      name: 'Starter',
      isActive: true,
    });
    expect(errors.some((e) => e.property === 'isActive')).toBe(true);
  });
});
