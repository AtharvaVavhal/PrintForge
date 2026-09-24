import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { UPLOAD_MAX_BYTES } from '../common/constants/app.constants';
import type { RequestWithTenantContext } from '../common/tenant/tenant-context';
import { StoreContextService } from '../common/tenant/store-domain-resolution/store-context.service';
import type { StorefrontRequest } from '../common/tenant/store-domain-resolution/store-context.service';
import { UploadsService } from './uploads.service';
import type { MulterFileLike } from './types/multer-file.interface';

type RequestWithHostname = RequestWithTenantContext & { hostname: string };

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
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }),
  )
  async upload(
    @UploadedFile() file: MulterFileLike | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithHostname,
  ): Promise<UploadedFileView> {
    if (!file) {
      throw new BadRequestException(
        'No file provided (expected multipart field "file")',
      );
    }
    // Reached by both admins (product images) and customers (customization
    // uploads) — `TenantContextGuard` only resolves a context for the
    // former (a customer holds no `TenantMembership`), so this prefers it
    // when present and otherwise resolves the storefront scope through
    // `StoreContextService` (Phase 9 W3, spec §4.4 — legacy or `Origin`-
    // keyed host resolution per the W2 kill-switch; Phase 4 W7 / P4-D2
    // before that). Passed as a thunk, resolved only after `create()`'s
    // own file validation passes (see its comment).
    const uploaded = await this.uploadsService.create(
      user.id,
      () =>
        this.storeContext.resolveActiveTenantId(
          request as unknown as StorefrontRequest,
        ),
      file,
    );
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
