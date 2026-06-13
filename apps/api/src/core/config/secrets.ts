/** Central secret resolution. Production requires real values; dev/test may fall back. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "dev-only-insecure-jwt-secret";
}
