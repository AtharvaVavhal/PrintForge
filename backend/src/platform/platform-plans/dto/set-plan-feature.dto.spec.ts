import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetPlanFeatureDto } from './set-plan-feature.dto';

/** Mirrors main.ts's global ValidationPipe options exactly — same
 * convention as `create-plan.dto.spec.ts`/`set-plan-limit.dto.spec.ts`. */
async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(SetPlanFeatureDto, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('SetPlanFeatureDto validation', () => {
  it('accepts enabled: true', async () => {
    const errors = await validateDto({ enabled: true });
    expect(errors).toHaveLength(0);
  });

  it('accepts enabled: false', async () => {
    const errors = await validateDto({ enabled: false });
    expect(errors).toHaveLength(0);
  });

  it('rejects an omitted enabled', async () => {
    const errors = await validateDto({});
    expect(errors.some((e) => e.property === 'enabled')).toBe(true);
  });

  it('rejects a non-boolean enabled', async () => {
    const errors = await validateDto({ enabled: 'yes' });
    expect(errors.some((e) => e.property === 'enabled')).toBe(true);
  });

  it('rejects an extraneous field (featureKey belongs on the route, never the body)', async () => {
    const errors = await validateDto({
      enabled: true,
      featureKey: 'coupons',
    });
    expect(errors.some((e) => e.property === 'featureKey')).toBe(true);
  });
});
