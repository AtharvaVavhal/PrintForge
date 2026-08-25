import { IsEmail, IsString, MinLength, Validate } from 'class-validator';
import { PasswordPolicyConstraint } from './validators/password-policy.constraint';

/**
 * The frozen User model (BLUEPRINT-v1.2.md §15) has no `name`/display-name
 * column — registration is email+password only. See the completion report
 * for why this diverges from the endpoint's plain-English description.
 */
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Validate(PasswordPolicyConstraint)
  password: string;
}
