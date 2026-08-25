import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { AppConfig } from '../../common/config/configuration';

/**
 * Thin wrapper around the Cloudinary SDK. Folders:
 * printforge/{env}/products/, printforge/{env}/customizations/{userId}/ (§22).
 */
@Injectable()
export class CloudinaryService implements OnModuleInit {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const config = this.configService.get('cloudinary', { infer: true });
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
  }

  // TODO(uploads): uploadStream(), signedDeliveryUrl(), destroy() (for the
  // 48h orphan-cleanup poller only — never for a file still referenced by a
  // cart or order, §24 invariant 7).
}
