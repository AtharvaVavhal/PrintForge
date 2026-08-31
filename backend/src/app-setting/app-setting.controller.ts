import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AppSettingService } from './app-setting.service';

@Controller('settings')
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  @Public()
  @Get(':key')
  async getOne(@Param('key') key: string) {
    const value = await this.appSettingService.get(key);
    return { value };
  }

  @Public()
  @Get()
  async getMany(@Query('keys') keys?: string) {
    const keyArray = keys ? keys.split(',').map((k) => k.trim()).filter(Boolean) : [];
    const values = await this.appSettingService.getMany(keyArray);
    return { data: values };
  }
}
