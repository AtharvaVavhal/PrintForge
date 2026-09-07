import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Access-token payload. Phase 2a (decision P2-D4) makes newly-issued merchant
 * tokens **thin** — only `sub` + `tokenVersion`. `email` / `role` are marked
 * optional because pre-Phase-2a tokens still carry them for one refresh-TTL
 * window (backward compatibility); validate() ignores those fields and reloads
 * everything from the DB, so a thin token and an old fat token authorize
 * identically.
 */
interface AccessTokenPayload {
  sub: string;
  tokenVersion: number;
  email?: string;
  role?: string;
}

/**
 * Verifies the short-lived access token from the Authorization: Bearer
 * header (never a cookie — only the refresh token is a cookie, §23).
 * Signature/expiry are checked by passport-jwt before validate() runs;
 * validate() additionally re-checks users.tokenVersion so a password
 * change / logout-all revokes already-issued access tokens almost
 * instantly despite them being stateless (§23).
 *
 * Phase 2a (SaaS Master Plan §8; decisions P2-D4, P2-D1): validate() also
 * loads the user's `platformRole` and ACTIVE tenant memberships as identity
 * facts. It does NOT derive an active tenant and does NOT make a tenant
 * authorization decision — that is Phase 3 (P2-D9; D6 deferred).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('auth', { infer: true }).accessTokenSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        tenantMemberships: {
          where: { status: 'ACTIVE' },
          select: { tenantId: true, role: true },
        },
      },
    });

    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      platformRole: user.platformRole,
      memberships: user.tenantMemberships.map((m) => ({
        tenantId: m.tenantId,
        role: m.role,
      })),
    };
  }
}
