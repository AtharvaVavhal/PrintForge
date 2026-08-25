import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';

interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

/**
 * GET /health — required by the frozen deployment topology (§30: Sentry +
 * GET /health + external uptime monitor). Deliberately has no dependency on
 * PrismaService: an uptime monitor must be able to distinguish "process is
 * up" from "database is reachable" as two different failure modes.
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthStatus {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
