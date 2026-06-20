// apps/api/src/core/auth/password.service.ts
import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }
  async verify(hash: string, plain: string): Promise<boolean> {
    try { return await argon2.verify(hash, plain); } catch { return false; }
  }
  validatePolicy(p: string): string | null {
    if (p.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(p)) return "Password must contain an uppercase letter.";
    if (!/[a-z]/.test(p)) return "Password must contain a lowercase letter.";
    if (!/[0-9]/.test(p)) return "Password must contain a number.";
    if (!/[^A-Za-z0-9]/.test(p)) return "Password must contain a special character.";
    return null;
  }
}
