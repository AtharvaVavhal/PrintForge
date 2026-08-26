import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaginatedResult } from '../common/types/api-response.interface';
import {
  decimalToPaise,
  paiseToDecimalString,
} from '../cart/pricing/money.util';
import { OrdersService } from '../orders/orders.service';
import { ListAdminCustomersQueryDto } from './dto/list-admin-customers-query.dto';
import {
  AdminCustomerDetailView,
  AdminCustomerListItemView,
} from './dto/customer-view.interface';
import {
  AdminDashboardView,
  OrderStatusCount,
} from './dto/dashboard-view.interface';

/** §19/§32: "paid-or-later" — everything from PAID onward in the lifecycle
 * except the two terminal statuses where the money isn't kept. Read off
 * business meaning, not re-derived from order-state-machine.ts (that table
 * encodes legal transitions, not "did this order generate revenue"). */
const REVENUE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

const RECENT_ORDERS_LIMIT = 10;
const RECENT_CUSTOMER_ORDERS_LIMIT = 5;

const CUSTOMER_INCLUDE = {
  _count: { select: { orders: true } },
} satisfies Prisma.UserInclude;

type CustomerRow = Prisma.UserGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  // ─── GET /admin/dashboard (§19, minimal — no charts) ───────────────────

  async getDashboard(): Promise<AdminDashboardView> {
    const [statusCounts, revenueAgg, recentOrders] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { status: { in: REVENUE_ORDER_STATUSES as OrderStatus[] } },
        _sum: { total: true },
      }),
      this.ordersService.adminRecentOrders(RECENT_ORDERS_LIMIT),
    ]);

    const countByStatus = new Map(
      statusCounts.map((row) => [row.status, row._count._all]),
    );
    const ordersByStatus: OrderStatusCount[] = Object.values(OrderStatus).map(
      (status) => ({
        status,
        count: countByStatus.get(status) ?? 0,
      }),
    );
    const totalOrders = statusCounts.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );

    return {
      totalOrders,
      ordersByStatus,
      totalRevenue: paiseToDecimalString(
        decimalToPaise(revenueAgg._sum.total ?? new Prisma.Decimal(0)),
      ),
      recentOrders,
    };
  }

  // ─── GET /admin/customers[/:id] (§19, read-only) ────────────────────────

  async listCustomers(
    query: ListAdminCustomersQueryDto,
  ): Promise<PaginatedResult<AdminCustomerListItemView>> {
    const where: Prisma.UserWhereInput = {
      role: Role.CUSTOMER,
      ...(query.search
        ? { email: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: CUSTOMER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toCustomerListItemView(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getCustomerDetail(id: string): Promise<AdminCustomerDetailView> {
    // Scoped to role=CUSTOMER, same as the list — an admin id 404s here
    // rather than leaking another admin's profile through this endpoint.
    const user = await this.prisma.user.findFirst({
      where: { id, role: Role.CUSTOMER },
      include: CUSTOMER_INCLUDE,
    });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const [revenueAgg, recentOrders] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          userId: id,
          status: { in: REVENUE_ORDER_STATUSES as OrderStatus[] },
        },
        _sum: { total: true },
      }),
      this.ordersService.listOrdersForUser(id, {
        page: 1,
        limit: RECENT_CUSTOMER_ORDERS_LIMIT,
      }),
    ]);

    return {
      ...this.toCustomerListItemView(user),
      totalSpend: paiseToDecimalString(
        decimalToPaise(revenueAgg._sum.total ?? new Prisma.Decimal(0)),
      ),
      recentOrders: recentOrders.items,
    };
  }

  private toCustomerListItemView(user: CustomerRow): AdminCustomerListItemView {
    return {
      id: user.id,
      email: user.email,
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      city: user.city,
      state: user.state,
      postalCode: user.postalCode,
      country: user.country,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      orderCount: user._count.orders,
    };
  }
}
