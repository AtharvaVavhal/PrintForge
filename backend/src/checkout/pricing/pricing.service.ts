import { Injectable } from '@nestjs/common';

/**
 * Sole price authority (§24 invariant 1) — frontend-supplied
 * price/total/discount is never trusted. Pure computation, no I/O, so it
 * can be unit tested without a database.
 *
 * TODO(checkout): implement subtotal/shipping/tax/total computation once
 * §4's GST/tax dependency classification is resolved (deferred pending
 * client legal confirmation — see BLUEPRINT-v1.2.md §4).
 */
@Injectable()
export class PricingService {}
