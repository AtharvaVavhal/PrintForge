import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Field names deliberately mirror Razorpay Checkout.js's callback response
 * verbatim (`razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature`)
 * rather than this API's usual camelCase — this is an external-system
 * contract boundary, not an AB Creations-internal shape, and matching it
 * exactly is what every Razorpay integration guide has the frontend POST.
 */
export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  razorpay_order_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_payment_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_signature: string;
}
