import { NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { TenantContext } from '../common/tenant/tenant-context';

const TENANT_ID = 'tenant-a';
const tenantContext: TenantContext = {
  tenantId: TENANT_ID,
  source: 'membership-default',
  membership: { role: 'OWNER' },
};

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
    adminListOrdersForCustomer: jest
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

    const dashboard = await service.getDashboard(tenantContext);

    expect(dashboard.totalOrders).toBe(6);
  });

  it('zero-fills every OrderStatus, not just the ones with orders', async () => {
    const { service } = buildService({
      groupBy: [{ status: OrderStatus.PAID, _count: { _all: 3 } }],
    });

    const dashboard = await service.getDashboard(tenantContext);

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

  it('converts the paid-or-later revenue sum from Decimal to a major-unit string, scoped to the caller tenant', async () => {
    const { service, prisma } = buildService({
      aggregateSum: new Prisma.Decimal('12345.67'),
    });

    const dashboard = await service.getDashboard(tenantContext);

    expect(dashboard.totalRevenue).toBe('12345.67');
    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
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

    const dashboard = await service.getDashboard(tenantContext);

    expect(dashboard.totalRevenue).toBe('0.00');
  });

  it('scopes the status-count groupBy to the caller tenant (W10 hardening)', async () => {
    const { service, prisma } = buildService();

    await service.getDashboard(tenantContext);

    expect(prisma.order.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID } }),
    );
  });

  it('surfaces the last 10 recent orders from OrdersService, scoped to the caller tenant, newest first, unmodified', async () => {
    const recentOrders = [{ id: 'order-9' }, { id: 'order-1' }];
    const { service, ordersService } = buildService({ recentOrders });

    const dashboard = await service.getDashboard(tenantContext);

    expect(ordersService.adminRecentOrders).toHaveBeenCalledWith(
      tenantContext,
      10,
    );
    expect(dashboard.recentOrders).toBe(recentOrders);
  });
});

describe('AdminService.listCustomers — read-only, admin-excluded, tenant-scoped, no sensitive fields', () => {
  it('filters to role=CUSTOMER, scoped to customers with an order in the caller tenant (W10 hardening)', async () => {
    const { service, prisma } = buildService();

    await service.listCustomers(tenantContext, { page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: Role.CUSTOMER,
          orders: { some: { tenantId: TENANT_ID } },
        },
      }),
    );
  });

  it('applies email search and isActive filters when provided, still tenant-scoped', async () => {
    const { service, prisma } = buildService();

    await service.listCustomers(tenantContext, {
      page: 1,
      limit: 20,
      search: 'alice',
      isActive: false,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: Role.CUSTOMER,
          orders: { some: { tenantId: TENANT_ID } },
          email: { contains: 'alice', mode: 'insensitive' },
          isActive: false,
        },
      }),
    );
  });

  it("counts orders scoped to the caller tenant only, never a customer's cross-tenant total (W10 hardening)", async () => {
    const { service, prisma } = buildService();

    await service.listCustomers(tenantContext, { page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: { select: { orders: { where: { tenantId: TENANT_ID } } } },
        },
      }),
    );
  });

  it('never leaks passwordHash, tokenVersion, failedLoginAttempts, or reset-token fields', async () => {
    const { service } = buildService({
      findMany: [FULL_CUSTOMER_ROW],
      count: 1,
    });

    const { items } = await service.listCustomers(tenantContext, {
      page: 1,
      limit: 20,
    });

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

    const { items } = await service.listCustomers(tenantContext, {
      page: 1,
      limit: 20,
    });

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
      service.getCustomerDetail(tenantContext, 'missing-or-admin-id'),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException for a customer who exists but has never ordered from the caller's tenant (W10 hardening — cross-tenant customer lookup fails safe)", async () => {
    const { service, prisma } = buildService({ findFirst: null });

    await expect(
      service.getCustomerDetail(tenantContext, 'other-tenant-customer'),
    ).rejects.toThrow(NotFoundException);
    const [call] = prisma.user.findFirst.mock.calls[0] as [
      { where: { id: string; orders: { some: { tenantId: string } } } },
    ];
    expect(call.where.id).toBe('other-tenant-customer');
    expect(call.where.orders).toEqual({ some: { tenantId: TENANT_ID } });
  });

  it('computes totalSpend from paid-or-later orders scoped to the caller tenant and includes recent orders', async () => {
    const recentOrders = [{ id: 'order-1' }];
    const { service, prisma, ordersService } = buildService({
      findFirst: FULL_CUSTOMER_ROW,
      aggregateSum: new Prisma.Decimal('999.50'),
      recentOrders,
    });

    const detail = await service.getCustomerDetail(tenantContext, 'user-1');

    expect(detail.totalSpend).toBe('999.50');
    expect(detail.recentOrders).toBe(recentOrders);
    expect(detail).not.toHaveProperty('passwordHash');
    const aggregateArgs = prisma.order.aggregate.mock.calls[0][0] as {
      where: { userId: string; tenantId: string };
    };
    expect(aggregateArgs.where.userId).toBe('user-1');
    expect(aggregateArgs.where.tenantId).toBe(TENANT_ID);
    expect(ordersService.adminListOrdersForCustomer).toHaveBeenCalledWith(
      tenantContext,
      'user-1',
      expect.objectContaining({ page: 1 }),
    );
  });
});
