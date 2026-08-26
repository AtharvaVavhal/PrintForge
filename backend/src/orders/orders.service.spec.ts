import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

/**
 * Focused on the one behavior explicitly asked for: the admin
 * status-update path rejects an illegal transition before ever attempting
 * a write. Full happy-path coverage (successful transitions, manual-refund
 * flagging, view assembly) is exercised via live curl testing against a
 * real database, same as every other phase this session — a faithful
 * mock of the whole read/write/outbox chain here would be brittle for
 * little extra signal over order-lifecycle.util.spec.ts's pure-function
 * coverage of the same rule.
 */
describe('OrdersService.adminTransitionStatus — illegal transition rejection', () => {
  function buildService(currentStatus: OrderStatus) {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          userId: 'user-1',
          status: currentStatus,
        }),
        updateMany: jest.fn(),
      },
      paymentAttempt: {
        findFirst: jest.fn(),
      },
    };
    const notificationsService = { enqueueOutboxEvent: jest.fn() };
    const service = new OrdersService(
      prisma as never,
      notificationsService as never,
    );
    return { service, prisma };
  }

  it('rejects PENDING_PAYMENT -> SHIPPED with 409 and never writes', async () => {
    const { service, prisma } = buildService(OrderStatus.PENDING_PAYMENT);

    await expect(
      service.adminTransitionStatus('admin-1', 'order-1', {
        status: OrderStatus.SHIPPED,
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a backwards transition (DELIVERED -> IN_PRODUCTION) with 409', async () => {
    const { service, prisma } = buildService(OrderStatus.DELIVERED);

    await expect(
      service.adminTransitionStatus('admin-1', 'order-1', {
        status: OrderStatus.IN_PRODUCTION,
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects transitioning out of a terminal REFUNDED order', async () => {
    const { service, prisma } = buildService(OrderStatus.REFUNDED);

    await expect(
      service.adminTransitionStatus('admin-1', 'order-1', {
        status: OrderStatus.CONFIRMED,
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('never looks up a captured payment attempt for a rejected CANCELLED transition', async () => {
    const { service, prisma } = buildService(OrderStatus.PENDING_PAYMENT);

    await expect(
      service.adminTransitionStatus('admin-1', 'order-1', {
        status: OrderStatus.CANCELLED,
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.paymentAttempt.findFirst).not.toHaveBeenCalled();
  });
});
