import { Prisma } from '@prisma/client';

/**
 * The ONLY app_settings keys the storefront may read without
 * authentication. `GET /settings` and `GET /settings/:key` filter to this
 * list, so internal rows (e.g. the order-number counter written by
 * OrdersService.generateOrderNumber) are never publicly readable.
 *
 * `hero_slides` / `banners` / `showcase_categories` are consumed by the
 * homepage (services/api/settings.ts) but are NOT admin-configurable in
 * this phase — they still need to pass through the public read path.
 */
export const PUBLIC_SETTING_KEYS = [
  'announcement_text',
  'hero_slides',
  'banners',
  'showcase_categories',
] as const;

export type PublicSettingKey = (typeof PUBLIC_SETTING_KEYS)[number];

export function isPublicSettingKey(key: string): key is PublicSettingKey {
  return (PUBLIC_SETTING_KEYS as readonly string[]).includes(key);
}

export type AdminSettingKind = 'money' | 'text';

export interface AdminSettingDefinition {
  key: string;
  label: string;
  description: string;
  kind: AdminSettingKind;
  /** Returned when the row does not exist yet — never a fabricated value. */
  default: string;
}

interface NormalizeOk {
  valid: true;
  value: string;
}
interface NormalizeErr {
  valid: false;
  error: string;
}
export type NormalizeResult = NormalizeOk | NormalizeErr;

const MAX_SHIPPING_FEE_RUPEES = 100000;
const MAX_ANNOUNCEMENT_LENGTH = 200;

/**
 * Flat shipping fee, in rupees. Stored as a canonical 2-decimal string so
 * CheckoutService's `new Prisma.Decimal(setting.value)` → decimalToPaise
 * round-trip stays exact (money.util.ts §11 — never native float).
 */
function normalizeMoney(raw: string): NormalizeResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return {
      valid: false,
      error: 'A shipping fee is required (use 0 for free shipping)',
    };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      valid: false,
      error:
        'Shipping fee must be a non-negative amount with at most 2 decimal places',
    };
  }
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(trimmed);
  } catch {
    return { valid: false, error: 'Shipping fee is not a valid amount' };
  }
  if (decimal.isNegative()) {
    return { valid: false, error: 'Shipping fee cannot be negative' };
  }
  if (decimal.greaterThan(MAX_SHIPPING_FEE_RUPEES)) {
    return {
      valid: false,
      error: `Shipping fee cannot exceed ${MAX_SHIPPING_FEE_RUPEES}`,
    };
  }
  return { valid: true, value: decimal.toFixed(2) };
}

/** Announcement bar text — empty is valid and means "hide the bar". */
function normalizeText(raw: string): NormalizeResult {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_ANNOUNCEMENT_LENGTH) {
    return {
      valid: false,
      error: `Announcement text cannot exceed ${MAX_ANNOUNCEMENT_LENGTH} characters`,
    };
  }
  return { valid: true, value: trimmed };
}

const NORMALIZERS: Record<string, (raw: string) => NormalizeResult> = {
  shippingFeeFlat: normalizeMoney,
  announcement_text: normalizeText,
};

export const ADMIN_SETTING_DEFINITIONS: readonly AdminSettingDefinition[] = [
  {
    key: 'shippingFeeFlat',
    label: 'Flat shipping fee (₹)',
    description:
      'Charged once per order at checkout. Use 0 for free shipping. The server always recomputes the order total from this value inside the checkout transaction — it is never taken from the client.',
    kind: 'money',
    default: '0.00',
  },
  {
    key: 'announcement_text',
    label: 'Announcement bar text',
    description:
      'Shown in the storefront announcement bar. Leave blank to hide the bar.',
    kind: 'text',
    default: '',
  },
];

export function getAdminSettingDefinition(
  key: string,
): AdminSettingDefinition | undefined {
  return ADMIN_SETTING_DEFINITIONS.find((d) => d.key === key);
}

export function normalizeAdminSettingValue(
  key: string,
  raw: string,
): NormalizeResult {
  const normalize = NORMALIZERS[key];
  if (!normalize) {
    return { valid: false, error: `"${key}" is not an administrable setting` };
  }
  return normalize(raw);
}
