import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UploadApiResponse } from 'cloudinary';
import { AppConfig } from '../../../src/common/config/configuration';
import {
  CloudinaryService,
  CloudinaryUploadOptions,
} from '../../../src/uploads/cloudinary/cloudinary.service';

/**
 * DI replacement for CloudinaryService in every e2e test (see test-app.ts's
 * overrideProvider) — no test needs to reach the real Cloudinary API: the
 * magic-byte rejection tests (#9) never get this far, and the one test that
 * needs a genuinely stored file (#12, an uploadedFileId owned by another
 * user) only needs a believable uploaded_files row, not a real asset.
 * Deterministic and network-free keeps the suite fast and CI-safe.
 *
 * Constructor is explicitly redeclared (not just inherited) — Nest's DI
 * resolves a subclass's own `design:paramtypes` metadata, which TypeScript
 * only emits for a constructor actually written on that class.
 */
@Injectable()
export class FakeCloudinaryService extends CloudinaryService {
  constructor(configService: ConfigService<AppConfig, true>) {
    super(configService);
  }

  async uploadBuffer(
    buffer: Buffer,
    options: CloudinaryUploadOptions,
  ): Promise<UploadApiResponse> {
    return {
      public_id: `fake/${options.purpose}/${randomUUID()}`,
      bytes: buffer.length,
      format: 'png',
      resource_type: 'image',
    } as UploadApiResponse;
  }

  signedUrl(publicId: string): string {
    return `https://fake.test/cloudinary/${publicId}`;
  }
}
