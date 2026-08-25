import {
  CustomizationField,
  CustomizationFieldType,
  Prisma,
  SurchargeType,
} from '@prisma/client';
import { validateCustomizationFieldShape } from './customization-validation.util';

function makeField(
  overrides: Partial<CustomizationField> = {},
): CustomizationField {
  return {
    id: 'field-1',
    productId: 'product-1',
    label: 'Engraved Text',
    type: CustomizationFieldType.TEXT,
    isRequired: false,
    sortOrder: 0,
    helpText: null,
    constraints: null,
    surchargeType: SurchargeType.NONE,
    surchargeAmount: new Prisma.Decimal(0),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('validateCustomizationFieldShape', () => {
  it('rejects a missing required text field', () => {
    const field = makeField({ isRequired: true });
    const result = validateCustomizationFieldShape(field, {});
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/);
    expect(result.surchargePaise).toBe(0n);
  });

  it('accepts a missing optional field with zero surcharge', () => {
    const field = makeField({ isRequired: false });
    const result = validateCustomizationFieldShape(field, {});
    expect(result).toEqual({ valid: true, surchargePaise: 0n });
  });

  it('rejects a text value exceeding constraints.maxLength', () => {
    const field = makeField({ constraints: { maxLength: 5 } });
    const result = validateCustomizationFieldShape(field, {
      textValue: 'way too long',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at most 5 characters/);
  });

  it('rejects an uploadedFileId submitted against a TEXT field', () => {
    const field = makeField();
    const result = validateCustomizationFieldShape(field, {
      uploadedFileId: 'some-file-id',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expects a text value/);
  });

  it('rejects a textValue submitted against a file field', () => {
    const field = makeField({ type: CustomizationFieldType.LOGO_UPLOAD });
    const result = validateCustomizationFieldShape(field, {
      textValue: 'not a file',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expects an uploaded file/);
  });

  it('accepts a valid uploadedFileId for a file field (ownership checked async)', () => {
    const field = makeField({
      type: CustomizationFieldType.DESIGN_FILE_UPLOAD,
    });
    const result = validateCustomizationFieldShape(field, {
      uploadedFileId: 'file-123',
    });
    expect(result).toEqual({ valid: true, surchargePaise: 0n });
  });

  it('rejects a COLOR_SELECT value outside constraints.options', () => {
    const field = makeField({
      type: CustomizationFieldType.COLOR_SELECT,
      constraints: { options: ['red', 'blue'] },
    });
    const result = validateCustomizationFieldShape(field, {
      textValue: 'green',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/must be one of: red, blue/);
  });

  it('accepts a COLOR_SELECT value inside constraints.options', () => {
    const field = makeField({
      type: CustomizationFieldType.COLOR_SELECT,
      constraints: { options: ['red', 'blue'] },
    });
    const result = validateCustomizationFieldShape(field, {
      textValue: 'blue',
    });
    expect(result.valid).toBe(true);
  });

  it('computes FLAT surcharge once, in paise, regardless of text length', () => {
    const field = makeField({
      surchargeType: SurchargeType.FLAT,
      surchargeAmount: new Prisma.Decimal('49.50'),
    });
    const result = validateCustomizationFieldShape(field, {
      textValue: 'hello world',
    });
    expect(result.valid).toBe(true);
    expect(result.surchargePaise).toBe(4950n);
  });

  it('computes PER_CHARACTER surcharge scaled by textValue length, in paise', () => {
    const field = makeField({
      surchargeType: SurchargeType.PER_CHARACTER,
      surchargeAmount: new Prisma.Decimal('2.00'), // ₹2/char = 200 paise/char
    });
    const result = validateCustomizationFieldShape(field, {
      textValue: 'ABCDE',
    });
    expect(result.valid).toBe(true);
    expect(result.surchargePaise).toBe(1000n); // 5 chars * 200 paise
  });

  it('NONE surcharge is always zero', () => {
    const field = makeField({
      surchargeType: SurchargeType.NONE,
      surchargeAmount: new Prisma.Decimal('99.00'),
    });
    const result = validateCustomizationFieldShape(field, {
      textValue: 'anything',
    });
    expect(result.valid).toBe(true);
    expect(result.surchargePaise).toBe(0n);
  });
});
