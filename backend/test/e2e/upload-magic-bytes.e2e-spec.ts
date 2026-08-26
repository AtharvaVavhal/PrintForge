import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, authHeader, http, registerUser } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

const REAL_PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const REAL_JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00]);
const REAL_PDF_SIGNATURE = Buffer.from('%PDF-1.4\nfake body');
const PLAIN_TEXT = Buffer.from(
  'This is a plain text file with no image signature at all, renamed to look like a PNG.',
);
const GIF_SIGNATURE = Buffer.from('GIF89a-this-is-not-an-allowed-format');

/**
 * §27 #9 — magic-byte (file-signature) validation, independent of the
 * client-declared filename/Content-Type (BLUEPRINT-v1.2.md line 149:
 * "magic-byte/file-signature validation regardless of declared MIME type").
 * uploads.service.ts's detectFileSignature (file-signature.util.ts) is the
 * sole authority: only the actual bytes decide accept/reject, so a renamed
 * text file is rejected even with a convincing filename/Content-Type, and
 * conversely a genuinely valid image is accepted even if mislabeled.
 */
describe('Upload magic-byte validation (§27 #9)', () => {
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

  it('a plain-text file renamed to .png (declared image/png) is rejected with 422', async () => {
    const user = await registerUser(app);

    const res = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(user))
      .attach('file', PLAIN_TEXT, {
        filename: 'artwork.png',
        contentType: 'image/png',
      })
      .expect(422);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/doesn't match its extension/i);

    const files = await prisma.uploadedFile.findMany({
      where: { uploadedByUserId: user.id },
    });
    expect(files).toHaveLength(0);
  });

  it('a file with a disallowed real signature (GIF) is rejected with 422 even declared as an allowed type', async () => {
    const user = await registerUser(app);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(user))
      .attach('file', GIF_SIGNATURE, {
        filename: 'animation.png',
        contentType: 'image/png',
      })
      .expect(422);

    const files = await prisma.uploadedFile.findMany({
      where: { uploadedByUserId: user.id },
    });
    expect(files).toHaveLength(0);
  });

  it('a genuinely valid PNG is accepted', async () => {
    const user = await registerUser(app);

    const res = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(user))
      .attach('file', REAL_PNG_SIGNATURE, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(res.body.data.format).toBe('png');
  });

  it('a genuinely valid PDF is accepted', async () => {
    const user = await registerUser(app);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(user))
      .attach('file', REAL_PDF_SIGNATURE, {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
  });

  it('a genuinely valid JPEG is accepted even when its declared Content-Type/filename claims PNG — the control is byte-based, not label-based', async () => {
    const user = await registerUser(app);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(user))
      .attach('file', REAL_JPEG_SIGNATURE, {
        filename: 'not-actually-a.png',
        contentType: 'image/png',
      })
      .expect(201);
  });

  it('no file field at all is rejected with 400, not 422', async () => {
    const user = await registerUser(app);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(user))
      .expect(400);
  });
});
