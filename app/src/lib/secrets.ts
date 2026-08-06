/**
 * Encrypted app config — storage (R2) credentials + the public domain,
 * editable from /admin/settings without a redeploy (db/007_config_and_categories.sql).
 *
 * AES-256-GCM, key derived (SHA-256) from the ENCRYPTION_KEY env var — set
 * once at install (see deploy/env.example) and never stored in the DB itself.
 * Deliberately does NOT hold AUTH_SECRET / WORKER_SHARED_SECRET / the DB
 * password: see the migration's header comment for why those stay .env-only.
 *
 * Read LAZILY (only inside request-time functions), same rule as storage.ts —
 * `next build` must pass with zero env vars.
 */
import crypto from "node:crypto";
import { q } from "./db";

const ALGO = "aes-256-gcm";

function encryptionKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("Missing required env var: ENCRYPTION_KEY");
  return crypto.createHash("sha256").update(k).digest();
}

export async function getSecret(key: string): Promise<string | null> {
  try {
    const [row] = await q<{ iv: Buffer; tag: Buffer; ciphertext: Buffer }>(
      `SELECT iv, tag, ciphertext FROM encrypted_settings WHERE key=$1`, [key]);
    if (!row) return null;
    const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), row.iv);
    decipher.setAuthTag(row.tag);
    return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Table not migrated yet, DB unreachable, or ENCRYPTION_KEY unset/changed
    // — treat exactly like "not set", never crash the caller.
    return null;
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  await q(
    `INSERT INTO encrypted_settings (key, iv, tag, ciphertext, updated_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (key) DO UPDATE SET iv=$2, tag=$3, ciphertext=$4, updated_at=now()`,
    [key, iv, tag, ciphertext]);
}

export async function deleteSecret(key: string): Promise<void> {
  await q(`DELETE FROM encrypted_settings WHERE key=$1`, [key]);
}

// A value is set (DB override present) without decrypting it — used to show
// "configured" state in the admin UI without ever sending the secret back down.
export async function secretIsSet(key: string): Promise<boolean> {
  try {
    const [row] = await q(`SELECT 1 FROM encrypted_settings WHERE key=$1`, [key]);
    return !!row;
  } catch {
    return false;
  }
}

// DB override wins, env var is the fallback (same layering as siteConfig()).
export async function resolveConfig(key: string, envVar: string): Promise<string> {
  return (await getSecret(key)) || process.env[envVar]?.trim() || "";
}
