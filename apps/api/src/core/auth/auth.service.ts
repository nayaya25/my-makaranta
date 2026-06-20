import { Injectable, BadRequestException, UnauthorizedException, ForbiddenException, Inject } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomInt } from "node:crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { SmsService } from "./sms.service";
import { EMAIL_SERVICE, type EmailService } from "../email/email.types";
import { normalizePhone, phoneMatchVariants } from "./phone";
import { PasswordService } from "./password.service";
import { IdentityService } from "../identity/identity.service";

const OTP_TTL_MINUTES = 10;
const OTP_RATE_LIMIT_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

/** Cryptographically secure 6-digit code (no Math.random). */
function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

/** A login target is exactly one of phone or email. */
export interface OtpTarget {
  phone?: string;
  email?: string;
}

type NormalizedTarget =
  | { channel: "phone"; phone: string }
  | { channel: "email"; email: string };

export interface AuthResult {
  token: string;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    schoolId: string | null;
    identityType: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private jwt: JwtService,
    @Inject(EMAIL_SERVICE) private email: EmailService,
    private passwords: PasswordService,
    private identity: IdentityService,
  ) {}

  /** Exactly one of phone/email must be present. Accepts a bare phone string (legacy
   *  callers) or a { phone | email } target. Returns the channel + value. */
  private normalize(target: string | OtpTarget): NormalizedTarget {
    const obj: OtpTarget = typeof target === "string" ? { phone: target } : target;
    const phone = obj.phone ? normalizePhone(obj.phone) : undefined;
    const email = obj.email?.trim().toLowerCase();
    if (phone && email) throw new BadRequestException("Provide either a phone or an email, not both.");
    if (phone) return { channel: "phone", phone };
    if (email) return { channel: "email", email };
    throw new BadRequestException("A phone number or email is required.");
  }

  private whereFor(t: NormalizedTarget): { phone: string } | { email: string } {
    return t.channel === "email" ? { email: t.email } : { phone: t.phone };
  }

  async requestOtp(target: string | OtpTarget): Promise<void> {
    const t = this.normalize(target);
    const where = this.whereFor(t);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpRequest.count({
      where: { ...where, createdAt: { gte: oneHourAgo } },
    });
    if (recent >= OTP_RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException("Too many OTP requests. Try again in an hour.");
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Invalidate any prior live OTPs for this target so only the newest verifies.
    await this.prisma.otpRequest.updateMany({ where: { ...where, consumed: false }, data: { consumed: true } });
    await this.prisma.otpRequest.create({ data: { ...where, codeHash, expiresAt } });

    const text = `Your myMakaranta code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;
    if (t.channel === "email") {
      await this.email.send({
        to: t.email,
        subject: "Your myMakaranta sign-in code",
        text,
        html: `<p>Your myMakaranta sign-in code is <strong>${code}</strong>.</p><p>It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.</p>`,
      });
    } else {
      await this.sms.send(t.phone, text);
    }
  }

  async verifyOtp(target: string | OtpTarget, code: string): Promise<AuthResult> {
    const t = this.normalize(target);
    const where = this.whereFor(t);

    const otp = await this.prisma.otpRequest.findFirst({
      where: { ...where, consumed: false },
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

    // Auto-provisioned accounts are PENDING (no school, no identity) until they match an
    // invited Parent/Staff. A PENDING user's null schoolId means tenant-scoped queries
    // return nothing, so an unclaimed token cannot read any school's data.
    let user = await this.prisma.user.findFirst({ where });
    if (!user) {
      user = await this.prisma.user.create({ data: { ...where, identityType: "PENDING", identityId: "" } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    user = await this.linkIdentityIfMatch(user);

    const token = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      email: user.email,
      schoolId: user.schoolId,
      identityType: user.identityType,
      identityId: user.identityId,
      tokenVersion: user.tokenVersion,
    });
    return {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        schoolId: user.schoolId,
        identityType: user.identityType,
      },
    };
  }

  /**
   * Auto-claim a freshly auto-provisioned (PENDING) login when their phone OR email matches
   * EXACTLY ONE identity total — one Parent (xor) one Staff. Zero, multiple, or a cross-type
   * tie is ambiguous and left PENDING until explicitly claimed.
   */
  private async linkIdentityIfMatch<
    T extends { id: string; phone: string | null; email: string | null; identityType: string },
  >(user: T): Promise<T> {
    if (user.identityType !== "PENDING") return user;
    const or: Array<{ phone: { in: string[] } } | { email: string }> = [];
    if (user.phone) or.push({ phone: { in: phoneMatchVariants(user.phone) } });
    if (user.email) or.push({ email: user.email });
    if (or.length === 0) return user;

    const [parents, staff] = await Promise.all([
      this.prisma.parent.findMany({ where: { OR: or }, select: { id: true, schoolId: true } }),
      this.prisma.staff.findMany({ where: { OR: or }, select: { id: true, schoolId: true } }),
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
      // No permission grants — a STAFF identity is not tool access (RBAC is a separate slice).
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

  async loginWithPassword(schoolId: string, identifier: string, password: string) {
    const resolved = await this.identity.resolvePerson(schoolId, identifier);
    const ok = await this.passwords.verifySafe(resolved?.person.passwordHash, password);
    if (!resolved || !ok) throw new UnauthorizedException("Invalid credentials");
    const { person, membership } = resolved;
    const { roles, perms } = await this.identity.deriveAuthz(membership.id);
    const token = await this.jwt.signAsync({
      sub: person.id,
      mbr: membership.id,
      sch: membership.schoolId,
      roles,
      perms,
      tv: person.tokenVersion,
    });
    await this.prisma.person.update({ where: { id: person.id }, data: { lastLoginAt: new Date() } });
    return {
      token,
      person: { id: person.id, firstName: person.firstName, lastName: person.lastName },
      membershipId: membership.id,
    };
  }

  async switchContext(personId: string, membershipId: string): Promise<{ token: string }> {
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, personId } });
    if (!m) throw new ForbiddenException("Membership not available for this account.");
    const person = await this.prisma.person.findUniqueOrThrow({ where: { id: personId } });
    const { roles, perms } = await this.identity.deriveAuthz(m.id);
    const token = await this.jwt.signAsync({
      sub: personId,
      mbr: m.id,
      sch: m.schoolId,
      roles,
      perms,
      tv: person.tokenVersion,
    });
    return { token };
  }

  /** Step-up re-verification: validate a fresh phone OTP for an already-authenticated user. */
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
