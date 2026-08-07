import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { originalKey, presignUpload, beginMultipart, presignPart, uploadPlan } from "@/lib/storage";
import { storedFilename, firstName } from "@/lib/naming";
import { getOrCreateVideoAlbum } from "@/lib/videoAlbum";
export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { albumId, contributorName, creditLink, filename, contentType, bytes } = await req.json();
  const [al] = await q(`SELECT al.id, g.slug, g.id AS gallery_id FROM albums al JOIN galleries g ON g.id=al.gallery_id WHERE al.id=$1`, [albumId]);
  if (!al) return NextResponse.json({ error: "Unknown album." }, { status: 404 });
  const nm = (contributorName || "Official").trim();
  const link = creditLink?.trim() || null;
  const [ex] = await q(`SELECT id FROM contributors WHERE is_guest=false AND lower(display_name)=lower($1) LIMIT 1`, [nm]);
  let cid: string;
  if (ex) {
    cid = ex.id;
    // A link typed this upload updates the existing contributor's; leaving
    // it blank doesn't clear one set earlier — same "blank = unchanged"
    // convention as the gallery password field. Best-effort: db/010_contributor_link.sql
    // not applied yet just means the link is silently skipped, not a failed upload.
    if (link) { try { await q(`UPDATE contributors SET link_url=$2 WHERE id=$1`, [cid, link]); } catch {} }
  } else {
    try {
      cid = (await q(`INSERT INTO contributors (display_name, first_name, is_guest, link_url) VALUES ($1,$2,false,$3) RETURNING id`, [nm, firstName(nm), link]))[0].id;
    } catch {
      cid = (await q(`INSERT INTO contributors (display_name, first_name, is_guest) VALUES ($1,$2,false) RETURNING id`, [nm, firstName(nm)]))[0].id;
    }
  }
  const kind = /^video\//.test(contentType) ? "video" : "photo";
  // Videos are never shown on the public site — routed into a hidden
  // admin-only album regardless of which album was open in the admin UI
  // (db/009_video_album.sql).
  let targetAlbumId = al.id; let targetSlug = al.slug;
  if (kind === "video") {
    try { targetAlbumId = await getOrCreateVideoAlbum(al.gallery_id); targetSlug = "hidden-videos"; }
    catch { return NextResponse.json({ error: "Video uploads aren't set up yet — has db/009_video_album.sql been applied?" }, { status: 409 }); }
  }
  const [asset] = await q(
    `INSERT INTO assets (gallery_id, album_id, contributor_id, kind, source, visibility, status, ingest_key, original_filename, mime, bytes)
     VALUES ($1,$2,$3,$4,'admin','visible','awaiting_upload','',$5,$6,$7) RETURNING id`,
    [al.gallery_id, targetAlbumId, cid, kind, storedFilename(nm, filename), contentType, bytes]);
  const key = originalKey(targetSlug, asset.id, storedFilename(nm, filename));
  await q(`UPDATE assets SET ingest_key=$2 WHERE id=$1`, [asset.id, key]);
  if (bytes > uploadPlan.MULTIPART_THRESHOLD) {
    const uploadId = await beginMultipart(key, contentType); const n = Math.ceil(bytes / uploadPlan.PART_SIZE);
    return NextResponse.json({ assetId: asset.id, mode: "multipart", uploadId, partSize: uploadPlan.PART_SIZE, urls: await Promise.all(Array.from({ length: n }, (_, i) => presignPart(key, uploadId, i + 1))) });
  }
  return NextResponse.json({ assetId: asset.id, mode: "single", url: await presignUpload(key, contentType) });
}
