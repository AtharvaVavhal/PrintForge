import { NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { AdminService } from './admin.service';

const FULL_CUSTOMER_ROW = {
  id: 'user-1',
  email: 'customer@example.com',
  passwordHash: '$2b$12$superSecretHashValue',
  role: Role.CUSTOMER,
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
  _count: { orders: 4 },
};

interface BuildServiceOptions {
  findMany?: unknown[];
  count?: number;
  findFirst?: unknown;
  groupBy?: { status: OrderStatus; _count: { _all: number } }[];
  aggregateSum?: Prisma.Decimal | null;
  recentOrders?: unknown[];
}

function buildService({
  findMany = [],
  count = 0,
  findFirst = null,
  groupBy = [],
  aggregateSum = null,
  recentOrders = [],
}: BuildServiceOptions = {}) {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(findMany),
      count: jest.fn().mockResolvedValue(count),
      findFirst: jest.fn().mockResolvedValue(findFirst),
    },
    order: {
      groupBy: jest.fn().mockResolvedValue(groupBy),
      aggregate: jest
        .fn<Promise<{ _sum: { total: Prisma.Decimal | null } }>, [unknown]>()
        .mockResolvedValue({ _sum: { total: aggregateSum } }),
    },
  };
  const ordersService = {
    adminRecentOrders: jest.fn().mockResolvedValue(recentOrders),
    listOrdersForUser: jest
      .fn()
      .mockResolvedValue({ items: recentOrders, meta: {} }),
  };
  const service = new AdminService(prisma as never, ordersService as never);
  return { service, prisma, ordersService };
}

describe('AdminService.getDashboard — aggregation against seeded fixtures', () => {
  it('sums order count across all statuses returned by groupBy', async () => {
    const { service } = buildService({
      groupBy: [
        { status: OrderStatus.PAID, _count: { _all: 3 } },
        { status: OrderStatus.DELIVERED, _count: { _all: 2 } },
        { status: OrderStatus.CANCELLED, _count: { _all: 1 } },
      ],
    });

    const dashboard = await service.getDashboard();

    expect(dashboard.totalOrders).toBe(6);
  });

  it('zero-fills every OrderStatus, not just the ones with orders', async () => {
    const { service } = buildService({
      groupBy: [{ status: OrderStatus.PAID, _count: { _all: 3 } }],
    });

    const dashboard = await service.getDashboard();

    expect(dashboard.ordersByStatus).toHaveLength(
      Object.values(OrderStatus).length,
    );
    expect(dashboard.ordersByStatus).toContainEqual({
      status: OrderStatus.PAID,
      count: 3,
    });
    expect(dashboard.ordersByStatus).toContainEqual({
      status: OrderStatus.REFUNDED,
      count: 0,
    });
    expect(dashboard.ordersByStatus).toContainEqual({
      status: OrderStatus.PENDING_PAYMENT,
      count: 0,
    });
  });

  it('converts the paid-or-later revenue sum from Decimal to a major-unit string', async () => {
    const { service, prisma } = buildService({
      aggregateSum: new Prisma.Decimal('12345.67'),
    });

    const dashboard = await service.getDashboard();

    expect(dashboard.totalRevenue).toBe('12345.67');
    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            OrderStatus.PAID,
            OrderStatus.CONFIRMED,
            OrderStatus.IN_PRODUCTION,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
          ],
        },
      },
      _sum: { total: true },
    });
  });

  it('reports zero revenue instead of throwing when no order matches (aggregate _sum is null)', async () => {
    const { service } = buildService({ aggregateSum: null });

    const dashboard = await service.getDashboard();

    expect(dashboard.totalRevenue).toBe('0.00');
  });

  it('surfaces the last 10 recent orders from OrdersService, newest first, unmodified', async () => {
    const recentOrders = [{ id: 'order-9' }, { id: 'order-1' }];
    const { service, ordersService } = buildService({ recentOrders });

    const dashboard = await service.getDashboard();

    expect(ordersService.adminRecentOrders).toHaveBeenCalledWith(10);
    expect(dashboard.recentOrders).toBe(recentOrders);
  });
});

describe('AdminService.listCustomers — read-only, admin-excluded, no sensitive fields', () => {
  it('filters to role=CUSTOMER only', async () => {
    const { service, prisma } = buildService();

    await service.listCustomers({ page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: Role.CUSTOMER } }),
    );
  });

  it('applies email search and isActive filters when provided', async () => {
    const { service, prisma } = buildService();

    await service.listCustomers({
      page: 1,
      limit: 20,
      search: 'alice',
      isActive: false,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: Role.CUSTOMER,
          email: { contains: 'alice', mode: 'insensitive' },
          isActive: false,
        },
      }),
    );
  });

  it('never leaks passwordHash, tokenVersion, failedLoginAttempts, or reset-token fields', async () => {
    const { service } = buildService({
      findMany: [FULL_CUSTOMER_ROW],
      count: 1,
    });

    const { items } = await service.listCustomers({ page: 1, limit: 20 });

    expect(items[0]).not.toHaveProperty('passwordHash');
    expect(items[0]).not.toHaveProperty('tokenVersion');
    expect(items[0]).not.toHaveProperty('failedLoginAttempts');
    expect(items[0]).not.toHaveProperty('passwordResetTokenHash');
    expect(items[0]).not.toHaveProperty('passwordResetExpiresAt');
  });

  it('includes isActive and orderCount, unlike the self-service profile view', async () => {
    const { service } = buildService({
      findMany: [FULL_CUSTOMER_ROW],
      count: 1,
    });

    const { items } = await service.listCustomers({ page: 1, limit: 20 });

    expect(items[0]).toMatchObject({
      id: 'user-1',
      email: 'customer@example.com',
      isActive: true,
      orderCount: 4,
    });
  });
});

describe('AdminService.getCustomerDetail', () => {
  it('throws NotFoundException when the id does not belong to a CUSTOMER account (including admin ids)', async () => {
    const { service } = buildService({ findFirst: null });

    await expect(
      service.getCustomerDetail('missing-or-admin-id'),
    ).rejects.toThrow(NotFoundException);
  });

  it('computes totalSpend from paid-or-later orders and includes recent orders', async () => {
    const recentOrders = [{ id: 'order-1' }];
    const { service, prisma } = buildService({
      findFirst: FULL_CUSTOMER_ROW,
      aggregateSum: new Prisma.Decimal('999.50'),
      recentOrders,
    });

    const detail = await service.getCustomerDetail('user-1');

    expect(detail.totalSpend).toBe('999.50');
    expect(detail.recentOrders).toBe(recentOrders);
    expect(detail).not.toHaveProperty('passwordHash');
    const aggregateArgs = prisma.order.aggregate.mock.calls[0][0] as {
      where: { userId: string };
    };
    expect(aggregateArgs.where.userId).toBe('user-1');
  });
});
