import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Shape attached to `req.user` by JwtStrategy.validate() after a successful
 * access-token verification. Kept minimal — anything beyond identity/role
 * is looked up fresh from the DB by the handler, never trusted from the token.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
