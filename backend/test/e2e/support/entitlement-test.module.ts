import { Module } from '@nestjs/common';
import { EntitlementTestController } from './entitlement-test.controller';

/** Phase 6 W4 — test-only module wiring `EntitlementTestController` in.
 * See that controller's own header comment. Compiled only into the
 * `test-app.ts#createTestAppWithExtraModules` test app, never into the
 * real application. */
@Module({
  controllers: [EntitlementTestController],
})
export class EntitlementTestModule {}
