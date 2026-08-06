import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";
import { getSecret, setSecret, deleteSecret, secretIsSet } from "@/lib/secrets";

// Fields kept in encrypted_settings (db/007_config_and_categories.sql).
// access_key/secret are true credentials — never sent back to the browser,
// only whether one is currently set. endpoint/region/bucket aren't secret
// (they're visible in every presigned URL) so they're returned in full to
// prefill the form.
const KEYS: Record<string, string> = {
  endpoint: "s3_endpoint", region: "s3_region", bucket: "s3_bucket",
  accessKey: "s3_access_key", secret: "s3_secret",
  publicSiteUrl: "public_site_url",
};

export async function GET() {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const [endpoint, region, bucket, publicSiteUrl, accessKeySet, secretSet] = await Promise.all([
    getSecret(KEYS.endpoint), getSecret(KEYS.region), getSecret(KEYS.bucket), getSecret(KEYS.publicSiteUrl),
    secretIsSet(KEYS.accessKey), secretIsSet(KEYS.secret),
  ]);
  return NextResponse.json({
    endpoint: endpoint || "", region: region || "", bucket: bucket || "", publicSiteUrl: publicSiteUrl || "",
    accessKeySet, secretSet,
    envFallback: {
      endpoint: !!process.env.S3_ENDPOINT, region: !!process.env.S3_REGION, bucket: !!process.env.S3_BUCKET,
      accessKey: !!process.env.S3_ACCESS_KEY, secret: !!process.env.S3_SECRET, publicSiteUrl: !!process.env.PUBLIC_SITE_URL,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const { endpoint, region, bucket, accessKey, secret, publicSiteUrl } = await req.json();
  // Empty string clears the override (falls back to env); undefined leaves it
  // unchanged; a non-empty string sets it. Same convention as view_password.
  const writes: [string, string | undefined][] = [
    [KEYS.endpoint, endpoint], [KEYS.region, region], [KEYS.bucket, bucket],
    [KEYS.accessKey, accessKey], [KEYS.secret, secret], [KEYS.publicSiteUrl, publicSiteUrl],
  ];
  try {
    for (const [key, value] of writes) {
      if (value === undefined) continue;
      if (value.trim() === "") await deleteSecret(key);
      else await setSecret(key, value.trim());
    }
  } catch {
    return NextResponse.json({ error: "Couldn't save — has db/007_config_and_categories.sql been applied, and is ENCRYPTION_KEY set?" }, { status: 409 });
  }
  await audit(user.id, "update_storage_settings", null, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}
