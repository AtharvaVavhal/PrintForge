import { Prisma } from '@prisma/client';

/**
 * Decimal-safe rupees↔paise conversion (§11 "never native floating point").
 * All cart price arithmetic happens in bigint paise; these two functions are
 * the only places a Decimal/string boundary is crossed — once in, once out.
 */
export function decimalToPaise(amount: Prisma.Decimal): bigint {
  const paise = new Prisma.Decimal(amount)
    .times(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return BigInt(paise.toFixed(0));
}

/** bigint paise → major-unit decimal string, e.g. 4950n → "49.50" (§21). */
export function paiseToDecimalString(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const rupees = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? '-' : ''}${rupees.toString()}.${cents.toString().padStart(2, '0')}`;
}
