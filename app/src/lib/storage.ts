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

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Lazy singletons — created on first real use, never at import/build time.
let _s3: S3Client | null = null;
let _bucket: string | null = null;

function client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      endpoint: required("S3_ENDPOINT"),
      region: process.env.S3_REGION || "auto",
      credentials: { accessKeyId: required("S3_ACCESS_KEY"), secretAccessKey: required("S3_SECRET") },
    });
  }
  return _s3;
}
function bucket(): string {
  if (!_bucket) _bucket = required("S3_BUCKET");
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
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn });
}
export async function beginMultipart(key: string, contentType: string) {
  const r = await client().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }));
  if (!r.UploadId) throw new Error("R2 returned no UploadId");
  return r.UploadId;
}
export async function presignPart(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(client(), new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 6 * 3600 });
}
export async function completeMultipart(key: string, uploadId: string, parts: { ETag: string; PartNumber: number }[]) {
  await client().send(new CompleteMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) } }));
}
export async function abortMultipart(key: string, uploadId: string) {
  await client().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}
export const uploadPlan = { MULTIPART_THRESHOLD, PART_SIZE };

export async function presignDownload(key: string, downloadFilename?: string, expiresIn = 900) {
  const cmd = new GetObjectCommand({
    Bucket: bucket(), Key: key,
    ResponseContentDisposition: downloadFilename ? `attachment; filename="${downloadFilename.replace(/"/g, "")}"` : undefined,
  });
  return getSignedUrl(client(), cmd, { expiresIn });
}

export async function getObject(key: string) {
  const r = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return r.Body as any;
}
export async function putObject(key: string, body: Buffer, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
}
export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
export async function objectExists(key: string) {
  try { await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key })); return true; } catch { return false; }
}

// Stream an object's body straight from R2 (used by the zip route). Keeps the
// s3 client + bucket name private to this module.
export async function getObjectStream(key: string): Promise<any> {
  const r = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return r.Body;
}

export async function getObjectHead(key: string, bytes = 64): Promise<Buffer> {
  const r = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  const chunks: Buffer[] = [];
  for await (const c of r.Body as any) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}
