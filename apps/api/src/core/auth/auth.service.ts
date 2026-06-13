import { Injectable, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { SmsService } from "./sms.service";

const OTP_TTL_MINUTES = 10;
const OTP_RATE_LIMIT_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

    let user = await this.prisma.user.findFirst({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, identityType: "PARENT", identityId: "" },
      });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      schoolId: user.schoolId,
      identityType: user.identityType,
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
}
