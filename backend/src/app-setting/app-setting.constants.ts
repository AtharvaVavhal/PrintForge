import { Prisma } from '@prisma/client';

/**
 * The ONLY app_settings keys the storefront may read without
 * authentication. `GET /settings` and `GET /settings/:key` filter to this
 * list, so internal rows (e.g. the order-number / invoice-number counters)
 * are never publicly readable. Tax / invoice settings are admin-only and
 * are deliberately NOT here.
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

export type AdminSettingKind =
  'money' | 'text' | 'boolean' | 'enum' | 'percent';

export interface AdminSettingDefinition {
  key: string;
  label: string;
  description: string;
  kind: AdminSettingKind;
  /** Returned when the row does not exist yet — never a fabricated value. */
  default: string;
  /** Allowed values for `kind: 'enum'`. */
  options?: readonly string[];
  /** Marked true for values that MUST be supplied by the client/accountant
   * and are shipped blank — surfaced in the admin UI as "pending". */
  pendingClientInput?: boolean;
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
const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const INVOICE_PREFIX_PATTERN = /^[A-Z0-9/-]{1,16}$/;

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

function boundedText(max: number, label: string) {
  return (raw: string): NormalizeResult => {
    const trimmed = raw.trim();
    if (trimmed.length > max) {
      return {
        valid: false,
        error: `${label} cannot exceed ${max} characters`,
      };
    }
    return { valid: true, value: trimmed };
  };
}

function normalizeBoolean(raw: string): NormalizeResult {
  const v = raw.trim().toLowerCase();
  if (v !== 'true' && v !== 'false') {
    return { valid: false, error: 'Value must be "true" or "false"' };
  }
  return { valid: true, value: v };
}

/** GST percentage, 0–100, up to 2 decimals. Only meaningful once tax is
 * enabled; the client must confirm the actual rate. */
function normalizePercent(raw: string): NormalizeResult {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Rate must be a number between 0 and 100 with at most 2 decimals',
    };
  }
  const decimal = new Prisma.Decimal(trimmed);
  if (decimal.isNegative() || decimal.greaterThan(100)) {
    return { valid: false, error: 'Rate must be between 0 and 100' };
  }
  return { valid: true, value: decimal.toFixed(2) };
}

/** Structural GST identification-number check only — never a checksum,
 * never a fabricated value. Empty is allowed (pending client input). */
function normalizeGstin(raw: string): NormalizeResult {
  const v = raw.trim().toUpperCase();
  if (v === '') {
    return { valid: true, value: '' };
  }
  if (!GSTIN_PATTERN.test(v)) {
    return {
      valid: false,
      error:
        'GSTIN must be 15 characters in the standard format (e.g. 22AAAAA0000A1Z5)',
    };
  }
  return { valid: true, value: v };
}

function normalizeInvoicePrefix(raw: string): NormalizeResult {
  const v = raw.trim().toUpperCase();
  if (!INVOICE_PREFIX_PATTERN.test(v)) {
    return {
      valid: false,
      error:
        'Invoice prefix must be 1–16 characters using A–Z, 0–9, "-" or "/"',
    };
  }
  return { valid: true, value: v };
}

/** Every tax pricing mode the calculation engine (TaxService) supports. */
export const TAX_MODE_OPTIONS = ['INCLUSIVE', 'EXCLUSIVE'] as const;

/**
 * Phase 13.4 hardening — tax-EXCLUSIVE pricing increases the customer /
 * Razorpay total, and the client has NOT formally confirmed
 * inclusive-vs-exclusive pricing. Until they do, EXCLUSIVE cannot be
 * selected through the normal admin settings API/UI: a PATCH to
 * `tax.pricingMode=EXCLUSIVE` is rejected with a 400, and the setting's
 * dropdown only offers INCLUSIVE.
 *
 * The EXCLUSIVE calculation in TaxService and all its tests are kept
 * intact. To enable it once the client confirms: add `'EXCLUSIVE'` back
 * to `ADMIN_SETTABLE_TAX_MODES` below (one line) — nothing else changes.
 */
export const ADMIN_SETTABLE_TAX_MODES = ['INCLUSIVE'] as const;

function normalizeTaxPricingMode(raw: string): NormalizeResult {
  const v = raw.trim();
  if ((ADMIN_SETTABLE_TAX_MODES as readonly string[]).includes(v)) {
    return { valid: true, value: v };
  }
  if (v === 'EXCLUSIVE') {
    return {
      valid: false,
      error:
        'Tax-exclusive pricing is not available: it would increase customer and Razorpay totals and requires explicit business confirmation of inclusive-vs-exclusive pricing. Contact engineering to enable it.',
    };
  }
  return {
    valid: false,
    error: `Value must be one of: ${ADMIN_SETTABLE_TAX_MODES.join(', ')}`,
  };
}

const NORMALIZERS: Record<string, (raw: string) => NormalizeResult> = {
  shippingFeeFlat: normalizeMoney,
  announcement_text: boundedText(MAX_ANNOUNCEMENT_LENGTH, 'Announcement text'),
  'tax.enabled': normalizeBoolean,
  'tax.pricingMode': normalizeTaxPricingMode,
  'tax.ratePercent': normalizePercent,
  'invoice.numberPrefix': normalizeInvoicePrefix,
  'invoice.sellerLegalName': boundedText(MAX_NAME_LENGTH, 'Legal name'),
  'invoice.sellerAddress': boundedText(MAX_ADDRESS_LENGTH, 'Address'),
  'invoice.sellerGstin': normalizeGstin,
  'invoice.sellerState': boundedText(MAX_NAME_LENGTH, 'State'),
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
  {
    key: 'tax.enabled',
    label: 'GST / tax enabled',
    description:
      'When off (default), every order records tax = ₹0.00 and the customer total is unchanged. Turn on ONLY after the client confirms the applicable GST rate. Prices are treated as tax-inclusive unless the pricing mode below says otherwise.',
    kind: 'boolean',
    default: 'false',
  },
  {
    key: 'tax.pricingMode',
    label: 'Tax pricing mode',
    description:
      'INCLUSIVE (per the app blueprint §4): displayed prices already include GST and the GST amount is extracted from within the total — the customer total never changes. Tax-EXCLUSIVE pricing (GST added on top, total increases) is implemented but LOCKED pending explicit client confirmation of inclusive-vs-exclusive pricing; it cannot be selected here.',
    kind: 'enum',
    options: ADMIN_SETTABLE_TAX_MODES,
    default: 'INCLUSIVE',
  },
  {
    key: 'tax.ratePercent',
    label: 'Combined GST rate (%)',
    description:
      'Single combined GST percentage applied to the goods value (subtotal − discount). PENDING CLIENT CONFIRMATION — do not set a guessed value. The CGST/SGST/IGST split and place-of-supply rules are NOT implemented and require a separate business decision.',
    kind: 'percent',
    default: '0.00',
    pendingClientInput: true,
  },
  {
    key: 'invoice.numberPrefix',
    label: 'Invoice number prefix',
    description:
      'Prepended to a dedicated, gap-free invoice sequence (e.g. "INV-" → INV-000001). The statutory format (financial-year series, etc.) is PENDING CLIENT CONFIRMATION — this is a technical placeholder.',
    kind: 'text',
    default: 'INV-',
    pendingClientInput: true,
  },
  {
    key: 'invoice.sellerLegalName',
    label: 'Seller legal name (on invoice)',
    description:
      'Registered business name printed on invoices. PENDING CLIENT INPUT — left blank until supplied; invoices show a "seller details pending" note while empty.',
    kind: 'text',
    default: '',
    pendingClientInput: true,
  },
  {
    key: 'invoice.sellerAddress',
    label: 'Seller registered address (on invoice)',
    description:
      'Registered place of business printed on invoices. PENDING CLIENT INPUT.',
    kind: 'text',
    default: '',
    pendingClientInput: true,
  },
  {
    key: 'invoice.sellerGstin',
    label: 'Seller GSTIN (on invoice)',
    description:
      'The business GST identification number. PENDING CLIENT INPUT — validated for format only if entered, never fabricated. Without it an invoice is not a valid tax invoice.',
    kind: 'text',
    default: '',
    pendingClientInput: true,
  },
  {
    key: 'invoice.sellerState',
    label: 'Seller state / place of supply',
    description:
      'Seller state for place-of-supply determination. PENDING CLIENT INPUT — intra/inter-state (CGST+SGST vs IGST) logic is not implemented.',
    kind: 'text',
    default: '',
    pendingClientInput: true,
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
