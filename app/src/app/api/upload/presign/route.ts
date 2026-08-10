/**
 * Upload presign — the security boundary of the whole system.
 * Handles all three link modes. Everything that grants trust (album, moderation,
 * caps) is derived SERVER-SIDE from the link + its mode. The client supplies a
 * filename, size, and name — nothing that grants privilege.
 * Layers: rate limit → link check → PIN gate → consent → session caps → size check.
 */
import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { originalKey, presignUpload, beginMultipart, presignPart, uploadPlan } from "@/lib/storage";
import { storedFilename, firstName } from "@/lib/naming";
import { clientIp, hashIp, rateLimit, pinLocked, pinFail, pinReset } from "@/lib/security";
import { getOrCreateVideoAlbum } from "@/lib/videoAlbum";
import bcrypt from "bcryptjs";

const MIN_PHOTO_BYTES = 300 * 1024;

export async function POST(req: NextRequest) {
  const ip = clientIp(req); const iph = hashIp(ip);
  if (!(await rateLimit(`presign:${iph}`, 1, 20)))
    return NextResponse.json({ error: "Slow down a moment and try again." }, { status: 429 });

  const { token, filename, contentType, bytes, uploaderName, uploaderEmail, pin, agreed, sessionId } = await req.json();

  const [link] = await q(
    `SELECT l.*, g.slug, g.id AS gallery_id, g.guest_album_id, g.allow_uploads,
            g.max_files_per_session AS g_files, g.max_session_bytes AS g_bytes, g.max_file_bytes AS g_fbytes
     FROM upload_links l JOIN galleries g ON g.id = l.gallery_id
     WHERE l.token=$1 AND l.is_active AND (l.expires_at IS NULL OR l.expires_at > now())`, [token]);
  if (!link) return NextResponse.json({ error: "This upload link isn't valid or has been turned off." }, { status: 403 });
  if (!link.allow_uploads) return NextResponse.json({ error: "Uploads are closed for this event." }, { status: 403 });

  if (link.mode === "pin") {
    const lockKey = `pin:${link.id}:${iph}`;
    const locked = await pinLocked(lockKey);
    if (locked) return NextResponse.json({ error: `Too many wrong PINs. Try again in ${locked}s.` }, { status: 429 });
    if (!pin || !link.pin_hash || !(await bcrypt.compare(String(pin), link.pin_hash))) {
      await pinFail(lockKey);
      return NextResponse.json({ error: "That PIN isn't right.", needPin: true }, { status: 403 });
    }
    await pinReset(lockKey);
  }

  const isPhotographer = link.mode === "photographer";
  let targetAlbum = isPhotographer ? (link.target_album_id || link.guest_album_id) : link.guest_album_id;
  const visibility = isPhotographer ? "visible" : "pending";
  const source = isPhotographer ? "photographer" : "guest";
  if (!targetAlbum) return NextResponse.json({ error: "This event isn't set up for uploads yet." }, { status: 400 });

  const capFiles = isPhotographer ? (link.max_files_per_session ?? 5000) : link.g_files;
  const capBytes = isPhotographer ? (link.max_session_bytes ?? 107374182400) : link.g_bytes;
  const capFileBytes = isPhotographer ? (link.max_file_bytes ?? 21474836480) : link.g_fbytes;

  if (!agreed)
    return NextResponse.json({ error: "Please agree to the upload terms first." }, { status: 400 });

  let contributorId: string, contributorName: string;
  if (isPhotographer) {
    contributorId = link.contributor_id;
    const [c] = await q(`SELECT display_name FROM contributors WHERE id=$1`, [contributorId]);
    contributorName = c?.display_name || "Photographer";
  } else {
    if (!uploaderName?.trim()) return NextResponse.json({ error: "Please add your name so we can credit you." }, { status: 400 });
    contributorName = uploaderName.trim().slice(0, 100);
  }

  const kind = /^video\//.test(contentType) ? "video" : "photo";
  // Videos are never shown on the public site — every one, regardless of link
  // mode, is routed into a hidden admin-only album instead (db/009_video_album.sql).
  if (kind === "video") {
    try { targetAlbum = await getOrCreateVideoAlbum(link.gallery_id); }
    catch { return NextResponse.json({ error: "Video uploads aren't set up yet — has db/009_video_album.sql been applied?" }, { status: 409 }); }
  }
  if (bytes > capFileBytes) return NextResponse.json({ error: "That file is larger than this link allows." }, { status: 413 });
  if (kind === "photo" && bytes < MIN_PHOTO_BYTES)
    return NextResponse.json({ error: "That image looks like a compressed copy. Send the original from your camera roll rather than one that's been through WhatsApp." }, { status: 422 });

  let session = sessionId ? (await q(`SELECT * FROM upload_sessions WHERE id=$1 AND link_id=$2`, [sessionId, link.id]))[0] : null;
  if (!session) {
    if (!isPhotographer) {
      const [c] = await q(`INSERT INTO contributors (display_name, first_name, email, is_guest) VALUES ($1,$2,$3,true) RETURNING id`,
        [contributorName, firstName(contributorName), uploaderEmail?.trim() || null]);
      contributorId = c.id;
    }
    const [s] = await q(`INSERT INTO upload_sessions (link_id, contributor_id, ip_hash) VALUES ($1,$2,$3) RETURNING *`,
      [link.id, contributorId, iph]);
    session = s;
  } else { contributorId = session.contributor_id; }

  if (session.files_count >= capFiles)
    return NextResponse.json({ error: `That's the upload limit for this link (${capFiles} files). Thank you!` }, { status: 429 });
  if (Number(session.bytes_total) + bytes > capBytes)
    return NextResponse.json({ error: "That would go over the upload size limit for this link." }, { status: 429 });

  const [asset] = await q(
    `INSERT INTO assets (gallery_id, album_id, contributor_id, kind, source, visibility, status, ingest_key, original_filename, mime, bytes)
     VALUES ($1,$2,$3,$4,$5,$6,'awaiting_upload','',$7,$8,$9) RETURNING id`,
    [link.gallery_id, targetAlbum, contributorId, kind, source, visibility, storedFilename(contributorName, filename), contentType, bytes]);

  const key = originalKey(link.slug, asset.id, storedFilename(contributorName, filename));
  await q(`UPDATE assets SET ingest_key=$2 WHERE id=$1`, [asset.id, key]);
  await q(`UPDATE upload_sessions SET files_count=files_count+1, bytes_total=bytes_total+$2 WHERE id=$1`, [session.id, bytes]);

  const resp: any = { assetId: asset.id, sessionId: session.id };
  if (bytes > uploadPlan.MULTIPART_THRESHOLD) {
    const uploadId = await beginMultipart(key, contentType);
    const n = Math.ceil(bytes / uploadPlan.PART_SIZE);
    resp.mode = "multipart"; resp.uploadId = uploadId; resp.partSize = uploadPlan.PART_SIZE;
    resp.urls = await Promise.all(Array.from({ length: n }, (_, i) => presignPart(key, uploadId, i + 1)));
  } else { resp.mode = "single"; resp.url = await presignUpload(key, contentType); }
  return NextResponse.json(resp);
}
