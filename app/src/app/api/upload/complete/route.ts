import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { completeMultipart, objectExists } from "@/lib/storage";
export async function POST(req: NextRequest) {
  const { assetId, uploadId, parts } = await req.json();
  const [a] = await q(`SELECT * FROM assets WHERE id=$1 AND status='awaiting_upload'`, [assetId]);
  if (!a) return NextResponse.json({ error: "Unknown upload." }, { status: 404 });
  if (uploadId) await completeMultipart(a.ingest_key, uploadId, parts);
  if (!(await objectExists(a.ingest_key))) return NextResponse.json({ error: "File didn't arrive." }, { status: 400 });
  await q(`UPDATE assets SET status='uploaded' WHERE id=$1`, [assetId]);
  await q(`INSERT INTO jobs (type, asset_id) VALUES ('derive',$1)`, [assetId]);
  return NextResponse.json({ ok: true });
}
