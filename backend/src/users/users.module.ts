import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Base-layer domain module — depends on no other domain module (only
 * common/PrismaService via the global PrismaModule). See the corrected
 * module dependency graph reported alongside this scaffold.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
