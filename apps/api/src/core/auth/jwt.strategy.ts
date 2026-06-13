import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { getJwtSecret } from "../config/secrets";
import { PrismaService } from "../prisma/prisma.service";

export interface JwtPayload {
  sub: string;
  phone?: string;
  schoolId?: string | null;
  identityType: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
      ignoreExpiration: false,
    });
  }

  // Resolve identity from the DB per request so role/tenant changes and revocations
  // (via User.tokenVersion bump) take effect immediately rather than waiting 30 days.
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== (payload.tokenVersion ?? 0)) {
      throw new UnauthorizedException("Session expired. Please sign in again.");
    }
    return {
      id: user.id,
      phone: user.phone ?? undefined,
      schoolId: user.schoolId,
      identityType: user.identityType,
    };
  }
}
