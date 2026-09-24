import { Injectable } from '@nestjs/common';
import { CustomizationField } from '@prisma/client';
import { UploadsService } from '../../uploads/uploads.service';
import {
  CustomizationSubmission,
  CustomizationValidationResult,
  isFileFieldType,
  parseFieldConstraints,
  validateCustomizationFieldShape,
} from './customization-validation.util';

/**
 * The service Cart (Phase 4) calls when a customer adds/updates a
 * customized cart item — not wired to any HTTP route here (§20 has no
 * standalone endpoint for this; it's an internal building block). Layers
 * file existence/ownership/format/size checks (needs the `uploaded_files`
 * row — Business Rule 12, §24) on top of the pure shape/surcharge logic in
 * customization-validation.util.ts, reusing UploadsService rather than
 * re-implementing upload/ownership logic.
 */
@Injectable()
export class CustomizationValidationService {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * @param tenantId Phase 9 W4 (spec §4.4): the parent's tenant. When
   *   supplied, the uploaded file is looked up scoped to it — a file from
   *   another tenant yields the same "Uploaded file not found" as a
   *   nonexistent id (no existence leak), before the ownership check.
   */
  async validate(
    field: CustomizationField,
    submission: CustomizationSubmission,
    requestingUserId: string,
    tenantId?: string,
  ): Promise<CustomizationValidationResult> {
    const shapeResult = validateCustomizationFieldShape(field, submission);
    if (!shapeResult.valid) {
      return shapeResult;
    }
    if (!isFileFieldType(field.type) || !submission.uploadedFileId) {
      return shapeResult;
    }

    const file =
      tenantId === undefined
        ? await this.uploadsService.findById(submission.uploadedFileId)
        : await this.uploadsService.findByIdInTenant(
            submission.uploadedFileId,
            tenantId,
          );
    if (!file) {
      return {
        valid: false,
        error: 'Uploaded file not found',
        surchargePaise: 0n,
      };
    }
    if (file.uploadedByUserId !== requestingUserId) {
      return {
        valid: false,
        error: 'You do not own this uploaded file',
        surchargePaise: 0n,
      };
    }

    const constraints = parseFieldConstraints(field.constraints);
    if (
      constraints.allowedFormats &&
      constraints.allowedFormats.length > 0 &&
      !constraints.allowedFormats.includes(file.format)
    ) {
      return {
        valid: false,
        error: `${field.label} must be one of: ${constraints.allowedFormats.join(', ')}`,
        surchargePaise: 0n,
      };
    }
    if (
      constraints.maxFileSizeMb !== undefined &&
      file.bytes > constraints.maxFileSizeMb * 1024 * 1024
    ) {
      return {
        valid: false,
        error: `${field.label} must be at most ${constraints.maxFileSizeMb}MB`,
        surchargePaise: 0n,
      };
    }

    return shapeResult;
  }
}
