import { randomBytes } from "node:crypto";

// Unambiguous alphabet: no 0/1/I/L/O. 31 symbols.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Crypto-random, human-transcribable verification code (default 16 chars). */
export function generateVerificationCode(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
