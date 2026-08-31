import { Module } from '@nestjs/common';
import { AppSettingController } from './app-setting.controller';
import { AppSettingService } from './app-setting.service';

@Module({
  controllers: [AppSettingController],
  providers: [AppSettingService],
  exports: [AppSettingService],
})
export class AppSettingModule {}
