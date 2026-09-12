import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlanDto } from './update-plan.dto';

/** Mirrors main.ts's global ValidationPipe options exactly. */
async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(UpdatePlanDto, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('UpdatePlanDto validation', () => {
  it('accepts an empty body — every field is independently optional', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('accepts a partial update', async () => {
    const errors = await validateDto({ name: 'Starter Plus' });
    expect(errors).toHaveLength(0);
  });

  it('rejects key in the body — immutable after creation', async () => {
    const errors = await validateDto({ key: 'renamed' });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('rejects isActive in the body — lifecycle is via dedicated archive/restore routes', async () => {
    const errors = await validateDto({ isActive: false });
    expect(errors.some((e) => e.property === 'isActive')).toBe(true);
  });

  it('rejects a negative sortOrder', async () => {
    const errors = await validateDto({ sortOrder: -5 });
    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });

  it('rejects an empty-string name', async () => {
    const errors = await validateDto({ name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
