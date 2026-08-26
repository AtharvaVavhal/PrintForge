import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  createProduct,
  http,
  registerAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

const REAL_PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

/**
 * Fix: product images have no working delivery URL. Two independent
 * defects, both covered here:
 *   (a) uploads.service.ts hardcoded deliveryType: 'authenticated' for
 *       every upload, including admin product photos — should be 'upload'
 *       (public) for purpose='product', 'authenticated' only for
 *       purpose='customization'.
 *   (b) products.service.ts's read paths never attached a computed URL to
 *       ProductImage — only the bare cloudinaryPublicId shipped, which the
 *       frontend cannot turn into a working URL without the Cloudinary API
 *       secret.
 *
 * FakeCloudinaryService (support/fake-cloudinary.service.ts) returns
 * `https://fake.test/cloudinary/${publicId}` from signedUrl() regardless of
 * resourceType/deliveryType, so these tests assert deliveryType via the DB/
 * response fields directly rather than via URL shape — the actual signing
 * behavior (unsigned for 'upload', signed for 'authenticated') is
 * CloudinaryService's own pre-existing, unmodified logic, not what changed
 * here.
 */
describe('Product image delivery (uploads.service.ts + products.service.ts fix)', () => {
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

  it("an admin's upload (purpose=product) is stored with deliveryType 'upload'", async () => {
    const admin = await registerAdmin(app, prisma);

    const res = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', REAL_PNG_SIGNATURE, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(201);

    const uploaded = await prisma.uploadedFile.findUniqueOrThrow({
      where: { id: res.body.data.id as string },
    });
    expect(uploaded.deliveryType).toBe('upload');
    expect(uploaded.cloudinaryPublicId).toMatch(/^fake\/product\//);
  });

  it("a customer's upload (purpose=customization) is still stored with deliveryType 'authenticated'", async () => {
    const customer = await registerUser(app);

    const res = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(customer))
      .attach('file', REAL_PNG_SIGNATURE, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    const uploaded = await prisma.uploadedFile.findUniqueOrThrow({
      where: { id: res.body.data.id as string },
    });
    expect(uploaded.deliveryType).toBe('authenticated');
    expect(uploaded.cloudinaryPublicId).toMatch(/^fake\/customization\//);
  });

  it('POST /products/:id/images denormalizes resourceType/deliveryType from the upload and returns a working url', async () => {
    const admin = await registerAdmin(app, prisma);
    const { productId } = await createProduct(prisma);

    const uploadRes = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', REAL_PNG_SIGNATURE, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(201);
    const uploadedFileId = uploadRes.body.data.id as string;

    const imageRes = await http(app)
      .post(apiPath(`/products/${productId}/images`))
      .set(...authHeader(admin))
      .send({ uploadedFileId, isPrimary: true })
      .expect(201);

    expect(imageRes.body.data.resourceType).toBe('image');
    expect(imageRes.body.data.deliveryType).toBe('upload');
    expect(imageRes.body.data.url).toMatch(
      /^https:\/\/fake\.test\/cloudinary\//,
    );

    const stored = await prisma.productImage.findUniqueOrThrow({
      where: { id: imageRes.body.data.id as string },
    });
    expect(stored.resourceType).toBe('image');
    expect(stored.deliveryType).toBe('upload');
  });

  it('GET /products/:slug includes a working url for every image', async () => {
    const admin = await registerAdmin(app, prisma);
    const { productId, slug } = await createProduct(prisma);

    const uploadRes = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', REAL_PNG_SIGNATURE, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(201);
    const uploadedFileId = uploadRes.body.data.id as string;

    await http(app)
      .post(apiPath(`/products/${productId}/images`))
      .set(...authHeader(admin))
      .send({ uploadedFileId })
      .expect(201);

    const detailRes = await http(app)
      .get(apiPath(`/products/${slug}`))
      .expect(200);

    expect(detailRes.body.data.images).toHaveLength(1);
    const image = detailRes.body.data.images[0];
    expect(image.url).toBe(
      `https://fake.test/cloudinary/${image.cloudinaryPublicId}`,
    );
    // Never leaks the raw Cloudinary credentials needed to construct this —
    // there's simply no such field on the response to leak.
    expect(detailRes.text).not.toMatch(/api_secret|apiSecret/i);
  });

  it('GET /products (list) includes a working url for every image', async () => {
    const admin = await registerAdmin(app, prisma);
    const { productId } = await createProduct(prisma);

    const uploadRes = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', REAL_PNG_SIGNATURE, {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(201);
    const uploadedFileId = uploadRes.body.data.id as string;

    await http(app)
      .post(apiPath(`/products/${productId}/images`))
      .set(...authHeader(admin))
      .send({ uploadedFileId })
      .expect(201);

    const listRes = await http(app).get(apiPath('/products')).expect(200);

    const product = listRes.body.data.find(
      (p: { id: string }) => p.id === productId,
    );
    expect(product.images).toHaveLength(1);
    expect(product.images[0].url).toMatch(
      /^https:\/\/fake\.test\/cloudinary\//,
    );
  });
});
