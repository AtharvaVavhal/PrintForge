import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentAccountsModule } from './payment-accounts/payment-accounts.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayModule } from './razorpay/razorpay.module';
import { WebhookProcessor } from './webhooks/webhook-processor.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

/**
 * Depends on: orders (payment_attempts belong to an Order — §12),
 * RazorpayModule (Phase 7: extracted to its own leaf module so `orders`
 * can also depend on it for refunds without an orders<->payments module
 * cycle — see RazorpayModule's own doc comment), and PaymentAccountsModule
 * (Phase 8 P8-7: `PaymentsService.initiatePayment` uses the exported
 * `PaymentAccountResolutionService` to bind `Order.paymentAccountId` —
 * see that method's own P8-7 comment; no cycle, `PaymentAccountsModule`
 * never imports `PaymentsModule`). Deliberately does NOT import checkout —
 * checkout imports payments, not the reverse (see the corrected module
 * dependency graph reported alongside this scaffold; avoids a
 * checkout<->payments circular dependency / forwardRef()).
 */
@Module({
  // @Cron jobs here (PaymentReconciliationService, WebhookProcessor) are
  // discovered by the single schedule-module registration in AppModule — a
  // second registration in this feature module double-runs every job.
  imports: [OrdersModule, RazorpayModule, PaymentAccountsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WebhookProcessor, PaymentReconciliationService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
