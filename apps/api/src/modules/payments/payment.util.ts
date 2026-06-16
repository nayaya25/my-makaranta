import { randomBytes } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(len: number): string {
  const b = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[b[i]! % ALPHABET.length];
  return out;
}

export function generateReceiptCode(): string {
  return randomCode(16);
}

export function generateReceiptNo(): string {
  return `RCT-${randomCode(8)}`;
}

export function generatePaymentReference(): string {
  return `MMK-${randomCode(12)}`;
}
