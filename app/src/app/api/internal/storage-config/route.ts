import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { resolveConfig } from "@/lib/secrets";

// Lets the worker (a separate Node process with its own env, no ENCRYPTION_KEY)
// pick up R2 credentials set via /admin/settings without needing its own copy
// of the encrypted_settings table. Same worker-secret auth as
// api/internal/derivative. The worker falls back to its own S3_* env vars if
// this call fails (app not up yet, older app image, etc) — see worker/src/index.js.
function eq(a: string, b: string) { const A = Buffer.from(a), B = Buffer.from(b); return A.length === B.length && timingSafeEqual(A, B); }

export async function GET(req: NextRequest) {
  const s = req.headers.get("x-worker-secret") || "";
  if (!process.env.WORKER_SHARED_SECRET || !eq(s, process.env.WORKER_SHARED_SECRET)) return NextResponse.json({ error: "no" }, { status: 401 });
  const [endpoint, region, bucket, accessKeyId, secretAccessKey] = await Promise.all([
    resolveConfig("s3_endpoint", "S3_ENDPOINT"),
    resolveConfig("s3_region", "S3_REGION"),
    resolveConfig("s3_bucket", "S3_BUCKET"),
    resolveConfig("s3_access_key", "S3_ACCESS_KEY"),
    resolveConfig("s3_secret", "S3_SECRET"),
  ]);
  return NextResponse.json({ endpoint, region: region || "auto", bucket, accessKeyId, secretAccessKey });
}
