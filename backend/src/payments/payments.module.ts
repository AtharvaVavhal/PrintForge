import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay/razorpay.service';
import { WebhookProcessor } from './webhooks/webhook-processor.service';

/**
 * Depends on: orders only (payment_attempts belong to an Order — §12).
 * Deliberately does NOT import checkout — checkout imports payments, not
 * the reverse (see the corrected module dependency graph reported alongside
 * this scaffold; avoids a checkout<->payments circular dependency /
 * forwardRef()).
 */
@Module({
  imports: [OrdersModule, ScheduleModule.forRoot()],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayService, WebhookProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
