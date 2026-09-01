import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AppSettingService } from './app-setting.service';
import { isPublicSettingKey } from './app-setting.constants';

/**
 * Public storefront read surface only. Admin management of the
 * configurable subset lives on AdminController (GET /admin/settings,
 * PATCH /admin/settings/:key) — never here.
 *
 * Both handlers filter to PUBLIC_SETTING_KEYS, so internal rows such as
 * the order-number counter (app-setting.constants.ts) are never exposed
 * even if requested by exact key.
 */
@Controller('settings')
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  @Public()
  @Get(':key')
  async getOne(@Param('key') key: string) {
    if (!isPublicSettingKey(key)) {
      return { value: null };
    }
    const value = await this.appSettingService.get(key);
    return { value };
  }

  @Public()
  @Get()
  async getMany(@Query('keys') keys?: string) {
    const requested = keys
      ? keys
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
    const allowed = requested.filter(isPublicSettingKey);
    const values = await this.appSettingService.getMany(allowed);
    return { data: values };
  }
}
