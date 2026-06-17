import { Injectable, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomInt } from "node:crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { SmsService } from "./sms.service";

const OTP_TTL_MINUTES = 10;
const OTP_RATE_LIMIT_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

/** Cryptographically secure 6-digit code (no Math.random). */
function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export interface AuthResult {
  token: string;
  user: { id: string; phone: string; schoolId: string | null; identityType: string };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private jwt: JwtService,
  ) {}

  async requestOtp(phone: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpRequest.count({
      where: { phone, createdAt: { gte: oneHourAgo } },
    });
    if (recent >= OTP_RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException("Too many OTP requests. Try again in an hour.");
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Invalidate any prior live OTPs so only the newest can be verified (defeats per-row
    // lockout bypass; the per-hour rate limit caps the number of fresh codes).
    await this.prisma.otpRequest.updateMany({
      where: { phone, consumed: false },
      data: { consumed: true },
    });
    await this.prisma.otpRequest.create({ data: { phone, codeHash, expiresAt } });
    await this.sms.send(
      phone,
      `Your myMakaranta code is ${code}. Expires in ${OTP_TTL_MINUTES} minutes.`,
    );
  }

  async verifyOtp(phone: string, code: string): Promise<AuthResult> {
    const otp = await this.prisma.otpRequest.findFirst({
      where: { phone, consumed: false },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.expiresAt < new Date()) throw new BadRequestException("Invalid or expired code.");
    if (otp.attempts >= MAX_ATTEMPTS) throw new BadRequestException("Too many attempts.");

    const ok = await bcrypt.compare(code, otp.codeHash);
    await this.prisma.otpRequest.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 }, consumed: ok },
    });
    if (!ok) throw new BadRequestException("Invalid or expired code.");

    // Auto-provisioned accounts are PENDING (no school, no identity link) until Sprint 1's
    // invite/identity-linking claims them. A PENDING user's null schoolId means tenant-scoped
    // queries return nothing, so an unclaimed token cannot read any school's data.
    let user = await this.prisma.user.findFirst({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, identityType: "PENDING", identityId: "" },
      });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    user = await this.linkParentIfMatch(user);

    const token = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      schoolId: user.schoolId,
      identityType: user.identityType,
      tokenVersion: user.tokenVersion,
    });
    return {
      token,
      user: {
        id: user.id,
        phone: user.phone!,
        schoolId: user.schoolId,
        identityType: user.identityType,
      },
    };
  }

  /**
   * Auto-claim a freshly auto-provisioned (PENDING) login as a PARENT when their phone matches
   * exactly one Parent record. A phone that matches Parents across multiple schools is ambiguous
   * and left PENDING (no tenant assignment) until explicitly invited/claimed.
   */
  private async linkParentIfMatch<T extends { id: string; phone: string | null; identityType: string }>(
    user: T,
  ): Promise<T> {
    if (user.identityType !== "PENDING" || !user.phone) return user;
    const parents = await this.prisma.parent.findMany({
      where: { phone: user.phone },
      select: { id: true, schoolId: true },
    });
    if (parents.length !== 1) return user;
    const parent = parents[0]!;

    const { linked, fresh } = await this.prisma.$transaction(async (tx) => {
      // Atomic conditional claim: only one of two concurrent PENDING logins wins the link
      // (and the single tokenVersion bump). The WHERE re-checks identityType so a row that
      // was already claimed/changed yields count === 0.
      const claim = await tx.user.updateMany({
        where: { id: user.id, identityType: "PENDING" },
        data: {
          identityType: "PARENT",
          identityId: parent.id,
          schoolId: parent.schoolId,
          tokenVersion: { increment: 1 },
        },
      });
      if (claim.count === 0) {
        return { linked: false, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
      }
      // Resolve permission ids inside the txn so a concurrently-deleted perm cannot leave us
      // creating a UserPermission against a stale (FK-violating) permissionId.
      const perms = await tx.permission.findMany({
        where: { key: { in: ["fees.pay.own", "results.view.own"] } },
        select: { id: true },
      });
      if (perms.length > 0) {
        await tx.userPermission.createMany({
          data: perms.map((p) => ({ userId: user.id, permissionId: p.id, scope: {} })),
          skipDuplicates: true,
        });
      }
      return { linked: true, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
    });

    if (linked) {
      // Best-effort audit of the identity elevation; an audit failure must never break login.
      try {
        await this.prisma.auditLog.create({
          data: {
            schoolId: parent.schoolId,
            actorId: user.id,
            action: "User.linkParent",
            resourceType: "User",
            resourceId: user.id,
            after: { identityType: "PARENT", identityId: parent.id, schoolId: parent.schoolId },
          },
        });
      } catch {
        // best-effort audit; never break login
      }
    }
    return fresh as unknown as T;
  }

  /** Step-up re-verification: validate a fresh OTP for an already-authenticated user. No JWT issued; single-use. */
  async assertOtp(phone: string, code: string): Promise<void> {
    const otp = await this.prisma.otpRequest.findFirst({
      where: { phone, consumed: false },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.expiresAt < new Date()) throw new BadRequestException("Invalid or expired code.");
    if (otp.attempts >= MAX_ATTEMPTS) throw new BadRequestException("Too many attempts.");
    const ok = await bcrypt.compare(code, otp.codeHash);
    await this.prisma.otpRequest.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 }, consumed: ok },
    });
    if (!ok) throw new BadRequestException("Invalid or expired code.");
  }
}
