import { Controller } from '@nestjs/common';
import { UploadsService } from './uploads.service';

/**
 * Owns (§20): POST /uploads — Auth required (no guest path), rate-limited,
 * not idempotent by design.
 *
 * TODO(uploads): implement once the multipart pipeline (magic-byte check,
 * 10MB stream limit, UploadsGuard) is wired — see §22 threat-to-control table.
 */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}
}
