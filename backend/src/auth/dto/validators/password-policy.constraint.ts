import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Small common-password blocklist (§23: "rejected if purely numeric or on a
 * small common-password blocklist") — deliberately short, not a full
 * rockyou-style dictionary; that's out of scope for MVP.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'letmein1',
  'qwertyui',
  'qwerty123',
  'iloveyou',
  'admin1234',
  'welcome1',
  'abc12345',
  '12345678',
  '123456789',
]);

@ValidatorConstraint({ name: 'passwordPolicy', async: false })
export class PasswordPolicyConstraint implements ValidatorConstraintInterface {
  validate(password: unknown): boolean {
    if (typeof password !== 'string') {
      return false;
    }
    if (/^\d+$/.test(password)) {
      return false;
    }
    return !COMMON_PASSWORDS.has(password.toLowerCase());
  }

  defaultMessage(): string {
    return 'Password must not be purely numeric or a commonly used password';
  }
}
