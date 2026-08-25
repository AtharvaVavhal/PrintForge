import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { CloudinaryService } from './cloudinary/cloudinary.service';

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // TODO(uploads): create() — validate (magic-byte/MIME/extension/size),
  // stream to Cloudinary, persist uploaded_files row with
  // uploadedByUserId (non-nullable). Ownership is re-verified server-side
  // on every subsequent write that references uploadedFileId — §22/§24.
}
