import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { PIN_CODE_REGEX } from '../../common/validation/indian-address.util';
import { PIN_CODE_INVALID_MESSAGE } from '../postal.constants';

/**
 * Route-param guard for `GET /postal-codes/:postalCode` — same spirit as
 * the built-in `ParseUUIDPipe` used on the id routes elsewhere. Rejects
 * anything that is not exactly six digits *before* the request reaches the
 * service (which never then makes an outbound call for a malformed PIN),
 * and before it can be logged. Trims surrounding whitespace.
 */
@Injectable()
export class ParsePinCodePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!PIN_CODE_REGEX.test(trimmed)) {
      throw new BadRequestException(PIN_CODE_INVALID_MESSAGE);
    }
    return trimmed;
  }
}
