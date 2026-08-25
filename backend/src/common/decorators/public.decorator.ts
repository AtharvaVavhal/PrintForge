import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as not requiring authentication. Used by JwtAuthGuard,
 * which is applied globally (see AppModule) — every route is protected
 * by default and must opt out explicitly with @Public().
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);
