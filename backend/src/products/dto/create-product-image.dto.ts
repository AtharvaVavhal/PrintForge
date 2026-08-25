import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * References an existing upload from POST /uploads — this endpoint never
 * accepts a raw file body.
 */
export class CreateProductImageDto {
  @IsUUID()
  uploadedFileId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
