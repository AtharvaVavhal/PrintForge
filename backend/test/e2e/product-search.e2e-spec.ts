import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, createProduct, http } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * GET /products?search=... — case-insensitive substring match on
 * Product.name (products.service.ts's listProducts()), combined with the
 * existing categoryId filter via AND when both are present. isActive:true
 * still applies unconditionally underneath, same as every other list path.
 */
describe('GET /products search (products.service.ts listProducts)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('returns products whose name contains the search term', async () => {
    const { productId } = await createProduct(prisma, {
      name: 'Ceramic Coffee Mug',
    });
    await createProduct(prisma, { name: 'Canvas Tote Bag' });

    const res = await http(app)
      .get(apiPath('/products'))
      .query({ search: 'Coffee' })
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(productId);
  });

  it('matches case-insensitively', async () => {
    const { productId } = await createProduct(prisma, {
      name: 'Ceramic Coffee Mug',
    });

    const res = await http(app)
      .get(apiPath('/products'))
      .query({ search: 'coffee' })
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(productId);
  });

  it('returns an empty list when nothing matches', async () => {
    await createProduct(prisma, { name: 'Ceramic Coffee Mug' });

    const res = await http(app)
      .get(apiPath('/products'))
      .query({ search: 'Nonexistent Widget' })
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  it('combines search with categoryId via AND', async () => {
    const { productId, categoryId } = await createProduct(prisma, {
      name: 'Ceramic Coffee Mug',
    });
    // Same search term, different category — must be excluded once
    // categoryId is also constrained.
    await createProduct(prisma, { name: 'Ceramic Coffee Tumbler' });

    const res = await http(app)
      .get(apiPath('/products'))
      .query({ search: 'Coffee', categoryId })
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(productId);
  });
});
