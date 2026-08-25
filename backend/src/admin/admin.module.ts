import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Pure aggregation layer (§17) — may depend on multiple domain modules.
 * Does not itself own business logic beyond dashboard aggregation and
 * customer listing; product/order CRUD delegates to ProductsService /
 * OrdersService.
 */
@Module({
  imports: [OrdersModule, ProductsModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
