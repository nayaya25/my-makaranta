import { type NextRequest, NextResponse } from "next/server";
import { parseTenantHost } from "@/lib/tenant";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const slug = parseTenantHost(host);

  if (!slug) {
    // Apex / www / app / reserved — pass through unchanged
    return NextResponse.next();
  }

  // Tenant subdomain: forward the slug as a request header so RSCs and
  // server components can read it via getTenantSlug().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-slug", slug);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *  - _next/static  (static assets)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - public files with an extension (e.g. .png, .svg, .webp, .jpg, .ico, .js, .css)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff2?)$).*)",
  ],
};
