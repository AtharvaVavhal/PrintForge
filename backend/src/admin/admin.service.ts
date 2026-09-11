import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaginatedResult } from '../common/types/api-response.interface';
import { TenantContext } from '../common/tenant/tenant-context';
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

/**
 * W10 hardening — `User` (customer identity) carries no `tenantId` column
 * at all (Phase 2a/9/12 defer real per-tenant customer identity; SaaS
 * Master Plan §9/D5-a), so "this tenant's customers" cannot be a `where`
 * clause on `User` directly. It CAN be expressed via the one relation
 * that IS tenant-owned already: a customer only counts as "this tenant's"
 * if they have placed at least one order with it. `orderCount` is scoped
 * the same way — otherwise a customer's cross-tenant order volume would
 * leak onto a tenant that has never actually done business with them.
 */
function customerScopeWhere(tenantId: string): Prisma.UserWhereInput {
  return { orders: { some: { tenantId } } };
}

function customerInclude(tenantId: string) {
  return {
    _count: { select: { orders: { where: { tenantId } } } },
  } satisfies Prisma.UserInclude;
}

type CustomerRow = Prisma.UserGetPayload<{
  include: ReturnType<typeof customerInclude>;
}>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  // ─── GET /admin/dashboard (§19, minimal — no charts) ───────────────────

  /**
   * W10 hardening (P0) — the status/revenue aggregates below, and
   * adminRecentOrders, were unconditionally global (no `where.tenantId`
   * at all): every tenant's dashboard showed the WHOLE PLATFORM's order
   * counts, revenue, and recent-orders feed, not just their own.
   */
  async getDashboard(
    tenantContext: TenantContext,
  ): Promise<AdminDashboardView> {
    const [statusCounts, revenueAgg, recentOrders] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { tenantId: tenantContext.tenantId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: {
          tenantId: tenantContext.tenantId,
          status: { in: REVENUE_ORDER_STATUSES as OrderStatus[] },
        },
        _sum: { total: true },
      }),
      this.ordersService.adminRecentOrders(tenantContext, RECENT_ORDERS_LIMIT),
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

  /**
   * W10 hardening (P0) — this list, and getCustomerDetail below, were
   * unconditionally global across ALL tenants (no scoping at all — `User`
   * has no `tenantId` column to filter by): any tenant with
   * `customers:read` could browse every customer on the whole platform,
   * including their email/address/phone and order history with OTHER
   * tenants. Scoped via `customerScopeWhere`/`customerInclude` above (has
   * an order with this tenant).
   */
  async listCustomers(
    tenantContext: TenantContext,
    query: ListAdminCustomersQueryDto,
  ): Promise<PaginatedResult<AdminCustomerListItemView>> {
    const where: Prisma.UserWhereInput = {
      role: Role.CUSTOMER,
      ...customerScopeWhere(tenantContext.tenantId),
      ...(query.search
        ? { email: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: customerInclude(tenantContext.tenantId),
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

  async getCustomerDetail(
    tenantContext: TenantContext,
    id: string,
  ): Promise<AdminCustomerDetailView> {
    // Scoped to role=CUSTOMER + "has an order with this tenant", same as
    // the list — an admin id, another tenant's customer, or a customer
    // this tenant has never done business with all 404 here rather than
    // leaking another admin's profile or another tenant's customer
    // relationship through this endpoint.
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: Role.CUSTOMER,
        ...customerScopeWhere(tenantContext.tenantId),
      },
      include: customerInclude(tenantContext.tenantId),
    });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const [revenueAgg, recentOrders] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          userId: id,
          tenantId: tenantContext.tenantId,
          status: { in: REVENUE_ORDER_STATUSES as OrderStatus[] },
        },
        _sum: { total: true },
      }),
      this.ordersService.adminListOrdersForCustomer(tenantContext, id, {
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
