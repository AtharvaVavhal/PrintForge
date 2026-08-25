import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { UPLOAD_MAX_BYTES } from '../common/constants/app.constants';
import { UploadsService } from './uploads.service';
import type { MulterFileLike } from './types/multer-file.interface';

interface UploadedFileView {
  id: string;
  url: string;
  format: string;
  bytes: number;
  createdAt: Date;
}

/**
 * Owns (§20): POST /uploads — auth required (no guest path), any logged-in
 * user (customers upload their own customization files here too, reused
 * unchanged by the Phase 3 customization flow); GET /uploads/:id — owner or
 * admin only.
 */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }),
  )
  async upload(
    @UploadedFile() file: MulterFileLike | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadedFileView> {
    if (!file) {
      throw new BadRequestException(
        'No file provided (expected multipart field "file")',
      );
    }
    const uploaded = await this.uploadsService.create(user.id, file);
    return this.toView(uploaded, this.uploadsService.getSignedUrl(uploaded));
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadedFileView> {
    const file = await this.uploadsService.findById(id);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (
      file.uploadedByUserId !== user.id &&
      (user.role as Role) !== Role.ADMIN
    ) {
      throw new ForbiddenException();
    }
    return this.toView(file, this.uploadsService.getSignedUrl(file));
  }

  private toView(
    file: { id: string; format: string; bytes: number; createdAt: Date },
    url: string,
  ): UploadedFileView {
    return {
      id: file.id,
      url,
      format: file.format,
      bytes: file.bytes,
      createdAt: file.createdAt,
    };
  }
}
