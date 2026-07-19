import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { originalKey, presignUpload, beginMultipart, presignPart, uploadPlan } from "@/lib/storage";
import { storedFilename, firstName } from "@/lib/naming";
export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { albumId, contributorName, filename, contentType, bytes } = await req.json();
  const [al] = await q(`SELECT al.id, g.slug, g.id AS gallery_id FROM albums al JOIN galleries g ON g.id=al.gallery_id WHERE al.id=$1`, [albumId]);
  if (!al) return NextResponse.json({ error: "Unknown album." }, { status: 404 });
  const nm = (contributorName || "Official").trim();
  const [ex] = await q(`SELECT id FROM contributors WHERE is_guest=false AND lower(display_name)=lower($1) LIMIT 1`, [nm]);
  const cid = ex?.id ?? (await q(`INSERT INTO contributors (display_name, first_name, is_guest) VALUES ($1,$2,false) RETURNING id`, [nm, firstName(nm)]))[0].id;
  const kind = /^video\//.test(contentType) ? "video" : "photo";
  const [asset] = await q(
    `INSERT INTO assets (gallery_id, album_id, contributor_id, kind, source, visibility, status, ingest_key, original_filename, mime, bytes)
     VALUES ($1,$2,$3,$4,'admin','visible','awaiting_upload','',$5,$6,$7) RETURNING id`,
    [al.gallery_id, albumId, cid, kind, storedFilename(nm, filename), contentType, bytes]);
  const key = originalKey(al.slug, asset.id, storedFilename(nm, filename));
  await q(`UPDATE assets SET ingest_key=$2 WHERE id=$1`, [asset.id, key]);
  if (bytes > uploadPlan.MULTIPART_THRESHOLD) {
    const uploadId = await beginMultipart(key, contentType); const n = Math.ceil(bytes / uploadPlan.PART_SIZE);
    return NextResponse.json({ assetId: asset.id, mode: "multipart", uploadId, partSize: uploadPlan.PART_SIZE, urls: await Promise.all(Array.from({ length: n }, (_, i) => presignPart(key, uploadId, i + 1))) });
  }
  return NextResponse.json({ assetId: asset.id, mode: "single", url: await presignUpload(key, contentType) });
}
