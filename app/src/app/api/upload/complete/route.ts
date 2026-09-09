import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { completeMultipart, verifyObjectSize } from "@/lib/storage";
export async function POST(req: NextRequest) {
  const { assetId, uploadId, parts } = await req.json();
  const [a] = await q(`SELECT * FROM assets WHERE id=$1 AND status='awaiting_upload'`, [assetId]);
  if (!a) return NextResponse.json({ error: "Unknown upload." }, { status: 404 });
  if (uploadId) {
    try { await completeMultipart(a.ingest_key, uploadId, parts); }
    catch { return NextResponse.json({ error: "File didn't arrive intact — please retry." }, { status: 400 }); }
  }
  // Existence alone isn't "intact" — check R2's own recorded size against
  // what the client declared at presign time, so a truncated/corrupted
  // upload doesn't get a success checkmark on the guest's screen.
  const { ok, actualBytes } = await verifyObjectSize(a.ingest_key, Number(a.bytes));
  if (!ok) return NextResponse.json({ error: actualBytes === null ? "File didn't arrive — please retry." : "File arrived incomplete — please retry." }, { status: 400 });
  await q(`UPDATE assets SET status='uploaded' WHERE id=$1`, [assetId]);
  await q(`INSERT INTO jobs (type, asset_id) VALUES ('derive',$1)`, [assetId]);
  return NextResponse.json({ ok: true });
}
