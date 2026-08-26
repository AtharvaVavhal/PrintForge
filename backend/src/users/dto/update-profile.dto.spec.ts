import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

/** Mirrors main.ts's global ValidationPipe options exactly, so this test
 * exercises the same rejection behavior production requests go through. */
async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(UpdateProfileDto, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('UpdateProfileDto validation', () => {
  it('accepts an empty body — every field is independently optional', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('accepts a partial update (single field)', async () => {
    const errors = await validateDto({ city: 'Pune' });
    expect(errors).toHaveLength(0);
  });

  it('accepts a full address update', async () => {
    const errors = await validateDto({
      addressLine1: '123 MG Road',
      addressLine2: 'Suite 4',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
      country: 'India',
      phone: '9876543210',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown field (forbidNonWhitelisted, e.g. email)', async () => {
    const errors = await validateDto({
      city: 'Pune',
      email: 'hacker@test.com',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects role in the body', async () => {
    const errors = await validateDto({ role: 'ADMIN' });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('rejects isActive in the body', async () => {
    const errors = await validateDto({ isActive: false });
    expect(errors.some((e) => e.property === 'isActive')).toBe(true);
  });

  it('rejects tokenVersion in the body', async () => {
    const errors = await validateDto({ tokenVersion: 99 });
    expect(errors.some((e) => e.property === 'tokenVersion')).toBe(true);
  });

  it('rejects passwordResetTokenHash in the body', async () => {
    const errors = await validateDto({ passwordResetTokenHash: 'x' });
    expect(errors.some((e) => e.property === 'passwordResetTokenHash')).toBe(
      true,
    );
  });

  it('rejects a non-string value for an address field', async () => {
    const errors = await validateDto({ city: 12345 });
    expect(errors.some((e) => e.property === 'city')).toBe(true);
  });

  it('rejects an address field exceeding its max length', async () => {
    const errors = await validateDto({ city: 'a'.repeat(101) });
    expect(errors.some((e) => e.property === 'city')).toBe(true);
  });

  it('rejects a phone value exceeding its max length', async () => {
    const errors = await validateDto({ phone: '1'.repeat(21) });
    expect(errors.some((e) => e.property === 'phone')).toBe(true);
  });
});
