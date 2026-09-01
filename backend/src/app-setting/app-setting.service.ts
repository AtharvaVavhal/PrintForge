import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import {
  ADMIN_SETTING_DEFINITIONS,
  AdminSettingKind,
  getAdminSettingDefinition,
  normalizeAdminSettingValue,
} from './app-setting.constants';

export interface AdminSettingView {
  key: string;
  label: string;
  description: string;
  kind: AdminSettingKind;
  value: string;
  default: string;
}

@Injectable()
export class AppSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    return setting?.value ?? null;
  }

  async getMany(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) {
      return {};
    }
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }

  // ─── Admin-configurable settings (allowlisted + validated) ────────────

  /** Every administrable setting with its current value (or its default if
   * no row exists yet). Never returns internal keys — only the ones
   * declared in ADMIN_SETTING_DEFINITIONS. */
  async listConfigurable(): Promise<AdminSettingView[]> {
    const keys = ADMIN_SETTING_DEFINITIONS.map((d) => d.key);
    const stored = await this.getMany(keys);
    return ADMIN_SETTING_DEFINITIONS.map((definition) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      kind: definition.kind,
      value: stored[definition.key] ?? definition.default,
      default: definition.default,
    }));
  }

  /**
   * Updates one administrable setting. Rejects any key not in the
   * allowlist and any value that fails that key's server-side validator,
   * so this endpoint can never write an arbitrary row or an invalid
   * money/text value.
   */
  async updateConfigurable(
    key: string,
    rawValue: string,
  ): Promise<AdminSettingView> {
    const definition = getAdminSettingDefinition(key);
    if (!definition) {
      throw new BadRequestException(`"${key}" is not an administrable setting`);
    }
    const result = normalizeAdminSettingValue(key, rawValue);
    if (!result.valid) {
      throw new BadRequestException(result.error);
    }
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: result.value },
      create: { key, value: result.value },
    });
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      kind: definition.kind,
      value: result.value,
      default: definition.default,
    };
  }
}
