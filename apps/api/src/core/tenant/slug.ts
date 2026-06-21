export const RESERVED_SUBDOMAINS = new Set([
  "app","www","api","admin","signup","mail","smtp","ftp","ns1","ns2",
  "static","assets","cdn","status","help","docs","blog",
]);
export function slugify(name: string): string {
  return name.toLowerCase().replace(/'/g, "").normalize("NFKD").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 40);
}
export function validateSlug(s: string): string | null {
  if (!/^[a-z0-9-]+$/.test(s)) return "Use only lowercase letters, numbers and hyphens.";
  if (s.length < 3 || s.length > 40) return "Must be 3–40 characters.";
  if (s.startsWith("-") || s.endsWith("-") || s.includes("--")) return "No leading, trailing or double hyphens.";
  if (RESERVED_SUBDOMAINS.has(s)) return "That subdomain is reserved.";
  return null;
}
