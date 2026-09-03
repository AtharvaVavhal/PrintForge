import { BadRequestException } from '@nestjs/common';
import { ParsePinCodePipe } from './pin-code.pipe';

describe('ParsePinCodePipe', () => {
  const pipe = new ParsePinCodePipe();

  it('passes a valid 6-digit PIN through', () => {
    expect(pipe.transform('411046')).toBe('411046');
  });

  it('trims surrounding whitespace', () => {
    expect(pipe.transform('  560001 ')).toBe('560001');
  });

  it('rejects a 5-digit value', () => {
    expect(() => pipe.transform('41104')).toThrow(BadRequestException);
  });

  it('rejects a 7-digit value', () => {
    expect(() => pipe.transform('4110461')).toThrow(BadRequestException);
  });

  it('rejects a non-numeric value', () => {
    expect(() => pipe.transform('abcdef')).toThrow(BadRequestException);
  });

  it('rejects an empty value', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('uses the standard client-facing message', () => {
    expect(() => pipe.transform('x')).toThrow(
      'Enter a valid 6-digit PIN code.',
    );
  });
});
