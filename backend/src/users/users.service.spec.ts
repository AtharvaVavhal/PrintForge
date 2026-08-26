import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

const FULL_USER_ROW = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$2b$12$superSecretHashValue',
  role: 'CUSTOMER',
  tokenVersion: 3,
  failedLoginAttempts: 2,
  passwordResetTokenHash: 'someResetTokenHash',
  passwordResetExpiresAt: new Date('2026-01-01T00:00:00Z'),
  addressLine1: '123 MG Road',
  addressLine2: null,
  city: 'Pune',
  state: 'Maharashtra',
  postalCode: '411001',
  country: 'India',
  phone: '9876543210',
  isActive: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-06-01T00:00:00Z'),
};

function buildService(findUniqueResult: unknown) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(findUniqueResult),
      update: jest.fn(),
    },
  };
  const service = new UsersService(prisma as never);
  return { service, prisma };
}

describe('UsersService.getProfile — never leaks sensitive fields', () => {
  it('excludes passwordHash, tokenVersion, failedLoginAttempts, passwordResetTokenHash, passwordResetExpiresAt, isActive, updatedAt', async () => {
    const { service } = buildService(FULL_USER_ROW);
    const view = await service.getProfile('user-1');

    expect(view).not.toHaveProperty('passwordHash');
    expect(view).not.toHaveProperty('tokenVersion');
    expect(view).not.toHaveProperty('failedLoginAttempts');
    expect(view).not.toHaveProperty('passwordResetTokenHash');
    expect(view).not.toHaveProperty('passwordResetExpiresAt');
    expect(view).not.toHaveProperty('isActive');
    expect(view).not.toHaveProperty('updatedAt');
  });

  it('includes exactly the documented fields, nothing more', async () => {
    const { service } = buildService(FULL_USER_ROW);
    const view = await service.getProfile('user-1');

    expect(Object.keys(view).sort()).toEqual(
      [
        'id',
        'email',
        'addressLine1',
        'addressLine2',
        'city',
        'state',
        'postalCode',
        'country',
        'phone',
        'role',
        'createdAt',
      ].sort(),
    );
  });

  it('returns the correct profile/address values for the ones it does include', async () => {
    const { service } = buildService(FULL_USER_ROW);
    const view = await service.getProfile('user-1');

    expect(view).toMatchObject({
      id: 'user-1',
      email: 'test@example.com',
      addressLine1: '123 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
      country: 'India',
      phone: '9876543210',
      role: 'CUSTOMER',
    });
  });

  it('throws NotFoundException when the user no longer exists', async () => {
    const { service } = buildService(null);
    await expect(service.getProfile('missing-user')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('UsersService.updateProfile', () => {
  it('only ever writes the 7 address/phone fields, regardless of what else is on the DTO object', async () => {
    const { service, prisma } = buildService({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({
      ...FULL_USER_ROW,
      city: 'Mumbai',
    });

    // Cast bypasses compile-time DTO shape so this also proves the service
    // itself — not just class-validator upstream — never forwards
    // anything beyond the 7 known keys into the Prisma write.
    const smuggled = {
      city: 'Mumbai',
      email: 'new@example.com',
      role: 'ADMIN',
      isActive: false,
      tokenVersion: 99,
      passwordHash: 'x',
    } as never;

    await service.updateProfile('user-1', smuggled);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        addressLine1: undefined,
        addressLine2: undefined,
        city: 'Mumbai',
        state: undefined,
        postalCode: undefined,
        country: undefined,
        phone: undefined,
      },
    });
  });

  it('returns a view with no sensitive fields after updating', async () => {
    const { service, prisma } = buildService({ id: 'user-1' });
    prisma.user.update.mockResolvedValue(FULL_USER_ROW);

    const view = await service.updateProfile('user-1', { city: 'Pune' });

    expect(view).not.toHaveProperty('passwordHash');
    expect(view).not.toHaveProperty('tokenVersion');
    expect(view).not.toHaveProperty('passwordResetTokenHash');
    expect(view).not.toHaveProperty('passwordResetExpiresAt');
    expect(view).not.toHaveProperty('isActive');
  });

  it('throws NotFoundException instead of writing if the user no longer exists', async () => {
    const { service, prisma } = buildService(null);
    await expect(
      service.updateProfile('missing-user', { city: 'Pune' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
