import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

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
    const settings = await this.prisma.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }
}
