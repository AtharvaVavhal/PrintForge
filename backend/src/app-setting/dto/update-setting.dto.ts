import { IsString, MaxLength } from 'class-validator';

/**
 * Per-key semantic validation (money format / non-negative / length / key
 * allowlist) happens in AppSettingService against the setting's definition
 * in app-setting.constants.ts. This DTO only bounds the raw payload so a
 * multi-megabyte body is rejected before it reaches that logic. Money
 * values arrive as decimal strings, the same convention every price in
 * this codebase uses.
 */
export class UpdateSettingDto {
  @IsString()
  @MaxLength(1000)
  value: string;
}
