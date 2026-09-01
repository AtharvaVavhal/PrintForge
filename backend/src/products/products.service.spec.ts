import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * Focused on reactivateProduct — the one method this phase adds. Same
 * direct-instantiation mocking pattern as orders.service.spec.ts. Full
 * CRUD-path coverage for the rest of ProductsService is exercised via
 * live curl testing against a real database, same as every other phase
 * this session.
 */
describe('ProductsService.reactivateProduct', () => {
  function buildService(
    existingProduct: { id: string; isActive: boolean } | null,
  ) {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(existingProduct),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: { isActive: boolean } }) =>
            Promise.resolve({ ...existingProduct, ...data }),
          ),
      },
    };
    const uploadsService = {};
    const service = new ProductsService(
      prisma as never,
      uploadsService as never,
    );
    return { service, prisma };
  }

  it('sets isActive back to true for a deactivated product', async () => {
    const { service, prisma } = buildService({ id: 'prod-1', isActive: false });

    await service.reactivateProduct('prod-1');

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { isActive: true },
    });
  });

  it('is idempotent — reactivating an already-active product is a no-op success, not an error', async () => {
    const { service, prisma } = buildService({ id: 'prod-1', isActive: true });

    await expect(service.reactivateProduct('prod-1')).resolves.toBeUndefined();
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { isActive: true },
    });
  });

  it('404s for a product id that does not exist, same as deactivateProduct', async () => {
    const { service, prisma } = buildService(null);

    await expect(service.reactivateProduct('missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

/**
 * Phase 13.2 — admin category activation. The public listCategories /
 * getCategoryTree stay isActive-filtered; these methods are the admin
 * management surface. RBAC + public-hiding is covered end-to-end in
 * test/e2e/admin-control-plane.e2e-spec.ts.
 */
describe('ProductsService — admin category management', () => {
  function buildService(
    existingCategory: { id: string; isActive: boolean } | null,
    all: Array<{ id: string; isActive: boolean }> = [],
  ) {
    const prisma = {
      category: {
        findUnique: jest.fn().mockResolvedValue(existingCategory),
        findMany: jest.fn().mockResolvedValue(all),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: { isActive: boolean } }) =>
            Promise.resolve({ ...existingCategory, ...data }),
          ),
      },
    };
    const service = new ProductsService(prisma as never, {} as never);
    return { service, prisma };
  }

  it('adminListCategories does NOT filter by isActive', async () => {
    const { service, prisma } = buildService(null, [
      { id: 'a', isActive: true },
      { id: 'b', isActive: false },
    ]);

    const result = await service.adminListCategories();

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
    expect(result).toHaveLength(2);
  });

  it('deactivateCategory sets isActive=false', async () => {
    const { service, prisma } = buildService({ id: 'cat-1', isActive: true });

    await service.deactivateCategory('cat-1');

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { isActive: false },
    });
  });

  it('reactivateCategory sets isActive=true and is idempotent', async () => {
    const { service, prisma } = buildService({ id: 'cat-1', isActive: true });

    await expect(service.reactivateCategory('cat-1')).resolves.toMatchObject({
      isActive: true,
    });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { isActive: true },
    });
  });

  it('404s deactivating a category that does not exist', async () => {
    const { service, prisma } = buildService(null);

    await expect(service.deactivateCategory('missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});

describe('ProductsService — admin product reads', () => {
  /** Captures the `where` the service builds so the isActive-filter
   * behaviour can be asserted without digging into `jest.Mock.mock.calls`
   * (typed `any`). End-to-end filtering is also covered in
   * test/e2e/admin-control-plane.e2e-spec.ts. */
  function buildService(product: Record<string, unknown> | null) {
    let listWhere: unknown;
    let getWhere: unknown;
    const prisma = {
      product: {
        findMany: jest.fn().mockImplementation((args: { where: unknown }) => {
          listWhere = args.where;
          return Promise.resolve(product ? [product] : []);
        }),
        count: jest.fn().mockResolvedValue(product ? 1 : 0),
        findUnique: jest.fn().mockImplementation((args: { where: unknown }) => {
          getWhere = args.where;
          return Promise.resolve(product);
        }),
      },
    };
    const uploads = { resolveUrl: () => 'https://example.test/img' };
    const service = new ProductsService(prisma as never, uploads as never);
    return {
      service,
      getListWhere: () => listWhere,
      getGetWhere: () => getWhere,
    };
  }

  it('adminListProducts applies no isActive filter by default', async () => {
    const { service, getListWhere } = buildService({
      id: 'p1',
      isActive: true,
      images: [],
    });

    await service.adminListProducts(1, 20, undefined, undefined, undefined);

    expect(getListWhere()).toEqual({});
  });

  it('adminListProducts narrows to inactive when status=inactive', async () => {
    const { service, getListWhere } = buildService(null);

    await service.adminListProducts(1, 20, undefined, undefined, 'inactive');

    expect(getListWhere()).toEqual({ isActive: false });
  });

  it('adminGetProduct looks up by id only — not isActive-filtered', async () => {
    const { service, getGetWhere } = buildService({
      id: 'p1',
      isActive: false,
      images: [],
    });

    await service.adminGetProduct('p1');

    expect(getGetWhere()).toEqual({ id: 'p1' });
  });

  it('adminGetProduct 404s when the product does not exist', async () => {
    const { service } = buildService(null);
    await expect(service.adminGetProduct('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
