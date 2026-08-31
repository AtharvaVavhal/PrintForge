import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayModule } from './razorpay/razorpay.module';
import { WebhookProcessor } from './webhooks/webhook-processor.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

/**
 * Depends on: orders (payment_attempts belong to an Order — §12), and
 * RazorpayModule (Phase 7: extracted to its own leaf module so `orders`
 * can also depend on it for refunds without an orders<->payments module
 * cycle — see RazorpayModule's own doc comment). Deliberately does NOT
 * import checkout — checkout imports payments, not the reverse (see the
 * corrected module dependency graph reported alongside this scaffold;
 * avoids a checkout<->payments circular dependency / forwardRef()).
 */
@Module({
  imports: [OrdersModule, RazorpayModule, ScheduleModule.forRoot()],
  controllers: [PaymentsController],
  providers: [PaymentsService, WebhookProcessor, PaymentReconciliationService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
