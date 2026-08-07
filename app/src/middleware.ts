import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const s3 = process.env.S3_ENDPOINT || "";
  // If the operator points SITE_LOGO_URL/SITE_FAVICON_URL at an external host,
  // allow images from those origins too — otherwise they're silently blocked by CSP.
  const extraOrigins = new Set<string>();
  for (const url of [process.env.SITE_LOGO_URL, process.env.SITE_FAVICON_URL]) {
    try { if (url) extraOrigins.add(new URL(url).origin); } catch {}
  }
  const imgExtra = [...extraOrigins].join(" ");
  // /embed/* pages (embed/g/[slug], embed/category/[slug], embed/all) are the
  // one deliberate exception to "never let this site be framed" — they exist
  // specifically to be dropped into an <iframe> on a third-party page, and
  // only ever expose data the public gallery routes already show (published,
  // non-unlisted, password rules respected). Everything else stays as
  // strict as before.
  const embeddable = req.nextUrl.pathname.startsWith("/embed/");
  // Presigned download/redirect + video playback come from the R2 endpoint host.
  res.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${s3} ${imgExtra}`,
    `media-src 'self' ${s3}`,
    `connect-src 'self' ${s3}`,
    embeddable ? "frame-ancestors *" : "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join("; "));
  res.headers.set("X-Content-Type-Options", "nosniff");
  // X-Frame-Options has no per-origin allowlist (unlike frame-ancestors) —
  // some older browsers honour it over CSP, so it has to be omitted entirely
  // for embeddable pages rather than set to anything permissive.
  if (!embeddable) res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
