/**
 * Security primitives shared across routes.
 *
 * - hashIp: we never store raw IPs. A keyed hash lets us rate-limit and track
 *   abuse without holding personal data we don't need.
 * - rateLimit: token-bucket in Postgres. Simple, survives restarts, no Redis.
 * - PIN lockout: exponential-ish backoff after wrong PINs, so a public PIN link
 *   can't be brute-forced.
 * - constant-time compare for secrets.
 */
import { q } from "./db";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

export function clientIp(req: NextRequest): string {
  // Behind Cloudflare + Caddy, the real IP is in these headers.
  return req.headers.get("cf-connecting-ip")
      || req.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || "0.0.0.0";
}

export function hashIp(ip: string): string {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET!).update(ip).digest("hex").slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

/**
 * Whole-gallery password gate. Unlocking sets a cookie (`gv_<galleryId>`)
 * holding an HMAC of the gallery id — proves "this browser passed the
 * password check" without a session table. Checked by the gallery page, the
 * zip download route, and the single-photo download redirect alike.
 */
export function galleryAccessToken(galleryId: string): string {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET!).update(`gallery-view:${galleryId}`).digest("hex");
}
export function checkGalleryAccess(cookieValue: string | undefined | null, galleryId: string): boolean {
  return !!cookieValue && safeEqual(cookieValue, galleryAccessToken(galleryId));
}

/**
 * Token-bucket rate limit. `rate` tokens/sec, `burst` max. Returns true if
 * allowed. One row per bucket key; refilled lazily on each check.
 */
export async function rateLimit(key: string, rate: number, burst: number): Promise<boolean> {
  const now = Date.now();
  const rows = await q<{ tokens: number; updated_at: string }>(
    `INSERT INTO rate_limits (bucket_key, tokens, updated_at) VALUES ($1,$2,now())
     ON CONFLICT (bucket_key) DO UPDATE SET bucket_key = rate_limits.bucket_key
     RETURNING tokens, extract(epoch from updated_at) AS updated_at`,
    [key, burst]
  );
  const row = rows[0];
  const elapsed = Math.max(0, now / 1000 - Number(row.updated_at));
  let tokens = Math.min(burst, Number(row.tokens) + elapsed * rate);
  if (tokens < 1) { await q(`UPDATE rate_limits SET tokens=$2, updated_at=now() WHERE bucket_key=$1`, [key, tokens]); return false; }
  tokens -= 1;
  await q(`UPDATE rate_limits SET tokens=$2, updated_at=now() WHERE bucket_key=$1`, [key, tokens]);
  return true;
}

/** PIN attempt tracking. Locks the key for a growing window after repeated fails. */
export async function pinLocked(key: string): Promise<number> {
  const rows = await q<{ locked_until: string | null }>(`SELECT locked_until FROM pin_attempts WHERE key=$1`, [key]);
  const until = rows[0]?.locked_until ? new Date(rows[0].locked_until).getTime() : 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

export async function pinFail(key: string): Promise<void> {
  const rows = await q<{ fails: number }>(
    `INSERT INTO pin_attempts (key, fails, updated_at) VALUES ($1,1,now())
     ON CONFLICT (key) DO UPDATE SET fails = pin_attempts.fails + 1, updated_at = now()
     RETURNING fails`, [key]
  );
  const fails = rows[0].fails;
  // 5 free tries, then lock for 30s, doubling each further fail, capped at 15 min.
  if (fails >= 5) {
    const lockSec = Math.min(900, 30 * Math.pow(2, fails - 5));
    await q(`UPDATE pin_attempts SET locked_until = now() + ($2 || ' seconds')::interval WHERE key=$1`, [key, lockSec]);
  }
}

export async function pinReset(key: string): Promise<void> {
  await q(`DELETE FROM pin_attempts WHERE key=$1`, [key]);
}

export async function audit(userId: string | null, action: string, detail: any, ipHash?: string) {
  await q(`INSERT INTO audit_log (user_id, action, detail, ip_hash) VALUES ($1,$2,$3,$4)`,
    [userId, action, detail ? JSON.stringify(detail) : null, ipHash || null]);
}
