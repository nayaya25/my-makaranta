import { createHmac, timingSafeEqual } from "node:crypto";
import { getJwtSecret } from "../config/secrets";

function secret(): string {
  return process.env.FILE_SIGNING_SECRET ?? getJwtSecret();
}

/** HMAC over key+expiry. The signature is an unguessable, time-limited capability for one key. */
export function signFileToken(key: string, expMs: number): string {
  return createHmac("sha256", secret()).update(`${key}:${expMs}`).digest("hex");
}

export function verifyFileToken(key: string, expMs: number, sig: string): boolean {
  if (!expMs || Number.isNaN(expMs) || Date.now() > expMs) return false;
  const expected = signFileToken(key, expMs);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
