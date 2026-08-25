import {
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UploadedFile } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { Role } from '../common/enums/role.enum';
import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_BYTES,
} from '../common/constants/app.constants';
import { CloudinaryService } from './cloudinary/cloudinary.service';
import { detectFileSignature } from './utils/file-signature.util';
import { MulterFileLike } from './types/multer-file.interface';

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(userId: string, file: MulterFileLike): Promise<UploadedFile> {
    if (file.size > UPLOAD_MAX_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds the maximum allowed size of ${UPLOAD_MAX_BYTES} bytes`,
      );
    }

    const detectedMime = detectFileSignature(file.buffer);
    if (!detectedMime || !UPLOAD_ALLOWED_MIME_TYPES.includes(detectedMime)) {
      throw new UnprocessableEntityException(
        "This file doesn't match its extension — please re-export and try again.",
      );
    }

    // §22 two-tier folder: admins land in products/ (this shared endpoint is
    // also how a product image gets uploaded before POST /products/:id/images
    // references it), everyone else in customizations/{userId}/. Role is
    // looked up fresh here rather than threaded through from the controller,
    // to keep this change confined to the uploads module.
    const uploader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const purpose: 'product' | 'customization' =
      uploader?.role === Role.ADMIN ? 'product' : 'customization';

    const result = await this.cloudinary.uploadBuffer(file.buffer, {
      purpose,
      userId,
      deliveryType: 'authenticated',
    });

    return this.prisma.uploadedFile.create({
      data: {
        cloudinaryPublicId: result.public_id,
        uploadedByUserId: userId,
        format: result.format ?? detectedMime.split('/')[1],
        bytes: result.bytes ?? file.size,
        resourceType: result.resource_type,
        deliveryType: 'authenticated',
      },
    });
  }

  async findById(id: string): Promise<UploadedFile | null> {
    return this.prisma.uploadedFile.findUnique({ where: { id } });
  }

  getSignedUrl(file: UploadedFile): string {
    return this.cloudinary.signedUrl(
      file.cloudinaryPublicId,
      file.resourceType,
      file.deliveryType,
    );
  }
}
