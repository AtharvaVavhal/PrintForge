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
