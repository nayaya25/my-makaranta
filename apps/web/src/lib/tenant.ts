/**
 * Tenant host parsing and slug resolution.
 * Pure functions live here so they can be unit-tested without Next.js.
 */

import type React from "react";
import { paletteVars } from "@mymakaranta/ui";

const RESERVED = new Set([
  "app",
  "www",
  "api",
  "admin",
  "signup",
  "mail",
  "smtp",
  "ftp",
  "ns1",
  "ns2",
  "static",
  "assets",
  "cdn",
  "status",
  "help",
  "docs",
  "blog",
]);

/**
 * Parse a tenant slug from a Host header value.
 *
 * Returns null for:
 *  - apex hosts  (mymakaranta.com, localhost)
 *  - reserved subdomains (app, www, api, …)
 *  - any other non-tenant host
 *
 * Returns the first DNS label otherwise.
 */
export function parseTenantHost(host: string): string | null {
  // Strip port
  const hostname = host.split(":")[0] ?? "";

  // Split into labels
  const labels = hostname.split(".");

  // No subdomain (apex): single label (e.g. "localhost") or exactly the base domain
  if (labels.length < 2) return null;

  const first = labels[0] ?? "";

  // If the host IS just the base domain (mymakaranta.com → ["mymakaranta","com"])
  // but has NO tenant prefix — detect by checking whether first label looks like the
  // bare domain name. We do this simply: if there's only one label before the TLD
  // that isn't a subdomain, the host is the apex. Since we can't import env vars in
  // a pure function, we treat ANY host whose first label matches RESERVED as null,
  // and additionally return null when the host has no subdomain at all.
  //
  // "ahlacademy.mymakaranta.com"  → labels = ["ahlacademy","mymakaranta","com"]
  // "mymakaranta.com"             → labels = ["mymakaranta","com"]
  // "ahlacademy.localhost:3000"   → hostname = "ahlacademy.localhost", labels = ["ahlacademy","localhost"]
  // "localhost"                   → labels = ["localhost"] → length < 2, already null

  // Two-label host where second label is a known TLD-ish token (com, net, org, io…)
  // or the token "localhost" → the first label IS the domain, not a subdomain.
  if (labels.length === 2) {
    // Two-label host: either "domain.tld" (apex) or "subdomain.localhost" (dev).
    // "subdomain.localhost" IS a valid tenant host in dev — the subdomain is first label.
    // "domain.com" is an apex — no subdomain present.
    if (labels[1] === "localhost") {
      // dev subdomain — fall through to reserved check + return first
    } else {
      // e.g. "mymakaranta.com" — apex, no subdomain
      return null;
    }
  }

  // Reserved check
  if (RESERVED.has(first)) return null;

  return first;
}

/**
 * Get the current tenant slug.
 *
 * Server: reads the `x-tenant-slug` header injected by middleware.
 * Client: parses window.location.host directly.
 *
 * Returns null when running on the apex/app host.
 */
export async function getTenantSlug(): Promise<string | null> {
  if (typeof window === "undefined") {
    // Server-side: dynamic import to avoid bundling next/headers into client
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-tenant-slug");
  }
  return parseTenantHost(window.location.host);
}

/**
 * Returns a React.CSSProperties object containing the CSS custom properties
 * for the given palette themeKey. Apply as `style={brandStyle(themeKey)}` on
 * a root wrapper element to inject the brand colour ramp for that tenant.
 *
 * Falls back to "teal" for unknown / missing keys.
 */
export function brandStyle(themeKey: string): React.CSSProperties {
  return paletteVars(themeKey) as React.CSSProperties;
}
