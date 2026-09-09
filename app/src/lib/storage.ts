/**
 * Storage — Cloudflare R2 (S3-compatible). Egress is free.
 *
 * Config is read LAZILY (first use), not at module load. Next.js loads every
 * route during `next build` to analyse it; if this file demanded env vars at
 * import time, the build would crash in Docker where no runtime env exists yet.
 * A lazy singleton keeps build-time clean and only requires config when actually
 * talking to R2 at runtime.
 *
 * Access model: presigned PUT for uploads, worker reads via GetObject, downloads
 * via short-lived presigned GET handed out by /d/<id>. Bucket stays private.
 */

import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveConfig } from "./secrets";

// Storage config: an /admin/settings override in `encrypted_settings` (see
// db/007_config_and_categories.sql) wins when present, the matching S3_* env
// var is the fallback — same layering as siteConfig(). Cached per-process
// once resolved so we're not hitting the DB on every R2 call; the settings
// UI process-restarts the app after a save (see api/admin/settings/storage)
// so a change always takes effect on next boot at the latest.
let _s3: S3Client | null = null;
let _bucket: string | null = null;

async function required(key: string, envVar: string): Promise<string> {
  const v = await resolveConfig(key, envVar);
  if (!v) throw new Error(`Storage isn't configured yet — set it at /admin/settings, or set ${envVar}.`);
  return v;
}

async function client(): Promise<S3Client> {
  if (!_s3) {
    const [endpoint, region, accessKeyId, secretAccessKey] = await Promise.all([
      required("s3_endpoint", "S3_ENDPOINT"),
      resolveConfig("s3_region", "S3_REGION"),
      required("s3_access_key", "S3_ACCESS_KEY"),
      required("s3_secret", "S3_SECRET"),
    ]);
    _s3 = new S3Client({
      endpoint,
      region: region || "auto",
      credentials: { accessKeyId, secretAccessKey },
      // Without this, the SDK defaults to virtual-hosted-style URLs
      // (https://<bucket>.<account>.r2.cloudflarestorage.com/...), which is a
      // different origin than S3_ENDPOINT — and middleware.ts's CSP connect-src
      // only allow-lists S3_ENDPOINT itself. Browsers then silently block the
      // presigned PUT (a CSP violation looks identical to a dropped connection
      // from JS: no response, onerror fires). Path-style keeps every request on
      // S3_ENDPOINT's exact origin so it always matches the CSP.
      forcePathStyle: true,
    });
  }
  return _s3;
}
async function bucket(): Promise<string> {
  if (!_bucket) _bucket = await required("s3_bucket", "S3_BUCKET");
  return _bucket;
}

export function originalKey(gallerySlug: string, assetId: string, filename: string) {
  const safe = filename.replace(/[^\w.\-]/g, "_").slice(-120);
  return `orig/${gallerySlug}/${assetId}/${safe}`;
}
export function deliverableKey(assetId: string, ext: string) {
  return `pub/${assetId.slice(0, 2)}/${assetId}.${ext.replace(/^\./, "")}`;
}

const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 32 * 1024 * 1024;

export async function presignUpload(key: string, contentType: string, expiresIn = 3600) {
  return getSignedUrl(await client(), new PutObjectCommand({ Bucket: await bucket(), Key: key, ContentType: contentType }), { expiresIn });
}
export async function beginMultipart(key: string, contentType: string) {
  const r = await (await client()).send(new CreateMultipartUploadCommand({ Bucket: await bucket(), Key: key, ContentType: contentType }));
  if (!r.UploadId) throw new Error("R2 returned no UploadId");
  return r.UploadId;
}
export async function presignPart(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(await client(), new UploadPartCommand({ Bucket: await bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 6 * 3600 });
}
export async function completeMultipart(key: string, uploadId: string, parts: { ETag: string; PartNumber: number }[]) {
  await (await client()).send(new CompleteMultipartUploadCommand({ Bucket: await bucket(), Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) } }));
}
export async function abortMultipart(key: string, uploadId: string) {
  await (await client()).send(new AbortMultipartUploadCommand({ Bucket: await bucket(), Key: key, UploadId: uploadId }));
}
export const uploadPlan = { MULTIPART_THRESHOLD, PART_SIZE };

export async function presignDownload(key: string, downloadFilename?: string, expiresIn = 900) {
  const cmd = new GetObjectCommand({
    Bucket: await bucket(), Key: key,
    ResponseContentDisposition: downloadFilename ? `attachment; filename="${downloadFilename.replace(/"/g, "")}"` : undefined,
  });
  return getSignedUrl(await client(), cmd, { expiresIn });
}

export async function getObject(key: string) {
  const r = await (await client()).send(new GetObjectCommand({ Bucket: await bucket(), Key: key }));
  return r.Body as any;
}
export async function putObject(key: string, body: Buffer, contentType: string) {
  await (await client()).send(new PutObjectCommand({ Bucket: await bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
}
export async function deleteObject(key: string) {
  await (await client()).send(new DeleteObjectCommand({ Bucket: await bucket(), Key: key }));
}
export async function objectExists(key: string) {
  try { await (await client()).send(new HeadObjectCommand({ Bucket: await bucket(), Key: key })); return true; } catch { return false; }
}
// Existence alone doesn't rule out a truncated/corrupted upload — a client
// that dropped bytes mid-PUT but still got a 2xx (or a multipart complete
// with a short final part) would pass objectExists() with a genuinely
// incomplete object. This confirms R2's own recorded size for the key
// matches what the client declared at presign time (assets.bytes), so
// "the file is there" actually means "the file is there, intact" before
// the guest sees a success checkmark. See api/upload/complete/route.ts.
export async function verifyObjectSize(key: string, expectedBytes: number): Promise<{ ok: boolean; actualBytes: number | null }> {
  try {
    const head = await (await client()).send(new HeadObjectCommand({ Bucket: await bucket(), Key: key }));
    const actualBytes = head.ContentLength ?? null;
    return { ok: actualBytes === expectedBytes, actualBytes };
  } catch { return { ok: false, actualBytes: null }; }
}

// Stream an object's body straight from R2 (used by the zip route). Keeps the
// s3 client + bucket name private to this module.
export async function getObjectStream(key: string): Promise<any> {
  const r = await (await client()).send(new GetObjectCommand({ Bucket: await bucket(), Key: key }));
  return r.Body;
}

export async function getObjectHead(key: string, bytes = 64): Promise<Buffer> {
  const r = await (await client()).send(new GetObjectCommand({ Bucket: await bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  const chunks: Buffer[] = [];
  for await (const c of r.Body as any) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}
