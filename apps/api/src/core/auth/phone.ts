/**
 * Phone normalization (Nigeria-aware).
 *
 * `normalizePhone` strips separators and canonicalises clear Nigerian local formats to
 * E.164 (+234…). It deliberately leaves already-international (+…) and ambiguous inputs
 * as their separator-stripped form rather than guessing a country code.
 */
export function normalizePhone(raw: string): string {
  const cleaned = raw.trim().replace(/[\s().-]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (/^0\d{10}$/.test(digits)) return "+234" + digits.slice(1); // 0803… -> +234803…
  if (!cleaned.startsWith("+") && /^234\d{10}$/.test(digits)) return "+" + digits; // 234… -> +234…
  return cleaned.startsWith("+") ? "+" + digits : cleaned; // +234… (normalised) or leave as-is
}

/**
 * Candidate stored formats to match an identity's phone against. Existing Parent/Staff
 * rows may hold a number in any of the common Nigerian forms, so we match the canonical
 * E.164 against its local (0…) and bare (234…/803…) variants too.
 */
export function phoneMatchVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const set = new Set<string>([phone, digits]);
  if (/^234\d{10}$/.test(digits)) {
    const local = digits.slice(3); // 803…
    set.add("+" + digits); // +234803…
    set.add("0" + local); // 0803…
    set.add(local); // 803…
  }
  return [...set];
}
