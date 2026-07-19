import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const s3 = process.env.S3_ENDPOINT || "";
  // If the operator points SITE_LOGO_URL at an external host, allow images from
  // that origin too — otherwise a custom logo silently gets blocked by CSP.
  let logoOrigin = "";
  try { logoOrigin = process.env.SITE_LOGO_URL ? new URL(process.env.SITE_LOGO_URL).origin : ""; } catch {}
  // Presigned download/redirect + video playback come from the R2 endpoint host.
  res.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${s3} ${logoOrigin}`,
    `media-src 'self' ${s3}`,
    `connect-src 'self' ${s3}`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join("; "));
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
