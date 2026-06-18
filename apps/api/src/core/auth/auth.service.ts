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

    user = await this.linkIdentityIfMatch(user);

    const token = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      schoolId: user.schoolId,
      identityType: user.identityType,
      identityId: user.identityId,
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
   * Auto-claim a freshly auto-provisioned (PENDING) login when their phone matches EXACTLY ONE
   * identity total — one Parent (xor) one Staff. Zero, multiple, or a cross-type tie (one Parent
   * AND one Staff) is ambiguous and left PENDING until explicitly claimed.
   */
  private async linkIdentityIfMatch<T extends { id: string; phone: string | null; identityType: string }>(
    user: T,
  ): Promise<T> {
    if (user.identityType !== "PENDING" || !user.phone) return user;
    const [parents, staff] = await Promise.all([
      this.prisma.parent.findMany({ where: { phone: user.phone }, select: { id: true, schoolId: true } }),
      this.prisma.staff.findMany({ where: { phone: user.phone }, select: { id: true, schoolId: true } }),
    ]);
    if (parents.length + staff.length !== 1) return user;
    if (parents.length === 1) return this.linkParent(user, parents[0]!);
    return this.linkStaff(user, staff[0]!);
  }

  private async linkParent<T extends { id: string; identityType: string }>(
    user: T,
    parent: { id: string; schoolId: string },
  ): Promise<T> {
    const { linked, fresh } = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.user.updateMany({
        where: { id: user.id, identityType: "PENDING" },
        data: { identityType: "PARENT", identityId: parent.id, schoolId: parent.schoolId, tokenVersion: { increment: 1 } },
      });
      if (claim.count === 0) {
        return { linked: false, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
      }
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
      try {
        await this.prisma.auditLog.create({
          data: { schoolId: parent.schoolId, actorId: user.id, action: "User.linkParent", resourceType: "User", resourceId: user.id, after: { identityType: "PARENT", identityId: parent.id, schoolId: parent.schoolId } },
        });
      } catch { /* best-effort audit; never break login */ }
    }
    return fresh as unknown as T;
  }

  private async linkStaff<T extends { id: string; identityType: string }>(
    user: T,
    staff: { id: string; schoolId: string },
  ): Promise<T> {
    const { linked, fresh } = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.user.updateMany({
        where: { id: user.id, identityType: "PENDING" },
        data: { identityType: "STAFF", identityId: staff.id, schoolId: staff.schoolId, tokenVersion: { increment: 1 } },
      });
      if (claim.count === 0) {
        return { linked: false, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
      }
      // No permission grants — a STAFF identity is not tool access (RBAC assignment is a separate slice).
      return { linked: true, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
    });
    if (linked) {
      try {
        await this.prisma.auditLog.create({
          data: { schoolId: staff.schoolId, actorId: user.id, action: "User.linkStaff", resourceType: "User", resourceId: user.id, after: { identityType: "STAFF", identityId: staff.id, schoolId: staff.schoolId } },
        });
      } catch { /* best-effort audit; never break login */ }
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
