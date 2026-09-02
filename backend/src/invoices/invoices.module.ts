import { Module } from '@nestjs/common';
import { AppSettingModule } from '../app-setting/app-setting.module';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';

/**
 * Invoice data model + idempotent generation (Phase 13.4). No controller
 * of its own — the two read routes live where the ownership/RBAC checks
 * already are: GET /orders/:id/invoice (OrdersModule, owner) and
 * GET /admin/orders/:id/invoice (AdminModule, ADMIN). Depends only on
 * app-setting (seller snapshot + invoice-number prefix); everything else
 * is read from the order's own immutable snapshots.
 */
@Module({
  imports: [AppSettingModule],
  providers: [InvoicesService, InvoiceNumberService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
