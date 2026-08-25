import { IsNotEmpty, IsString, MinLength, Validate } from 'class-validator';
import { PasswordPolicyConstraint } from './validators/password-policy.constraint';

export class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8)
  @Validate(PasswordPolicyConstraint)
  newPassword: string;
}
