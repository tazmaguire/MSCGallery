import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { parseVideoUrl } from "@/lib/videoEmbed";
import sanitizeHtml from "sanitize-html";
export async function GET(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const gid = new URL(req.url).searchParams.get("gallery");
  const albums = await q(
    `SELECT al.*, (SELECT count(*) FROM assets a WHERE a.album_id=al.id AND a.visibility='visible' AND (a.deletion_status IS NULL OR a.deletion_status='')) AS visible
     FROM albums al WHERE al.gallery_id=$1 ORDER BY al.sort_order, al.created_at`, [gid]);
  return NextResponse.json({ albums });
}
export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { galleryId, name, isPrivate, isShowcase } = await req.json();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  // Video showcase albums (db/016_video_showcase_album.sql) — a distinct
  // album type, not the hidden is_video_album (db/009). Always starts
  // hidden (is_private=true) until the admin configures and publishes it,
  // same as a new gallery starting unpublished.
  if (isShowcase) {
    try {
      const [a] = await q(
        `INSERT INTO albums (gallery_id, name, slug, is_private, is_showcase, sort_order)
         VALUES ($1,$2,$3,true,true, COALESCE((SELECT max(sort_order)+1 FROM albums WHERE gallery_id=$1),0)) RETURNING *`,
        [galleryId, name, slug]);
      return NextResponse.json(a);
    } catch {
      return NextResponse.json({ error: "Couldn't create a video showcase album — has db/016_video_showcase_album.sql been applied?" }, { status: 409 });
    }
  }
  const [a] = await q(
    `INSERT INTO albums (gallery_id, name, slug, is_private, sort_order)
     VALUES ($1,$2,$3,$4, COALESCE((SELECT max(sort_order)+1 FROM albums WHERE gallery_id=$1),0)) RETURNING *`,
    [galleryId, name, slug, !!isPrivate]);
  return NextResponse.json(a);
}
export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { id, is_private, is_unlisted, name, cover_asset_id, showcase } = await req.json();
  // is_video_album (db/009_video_album.sql) stays private no matter what's
  // requested — that's the entire point of it (videos are never shown on
  // the public site). Guarded here, not just in the UI, since this is a
  // real guarantee, not a preference: flipping it public would expose raw,
  // unprocessed video originals with no re-encoding or credit stamping.
  if (is_private !== undefined) {
    try {
      await q(`UPDATE albums SET is_private=$2 WHERE id=$1 AND is_guest_album=false AND is_video_album=false`, [id, is_private]);
    } catch {
      // db/009_video_album.sql not applied yet — no is_video_album column,
      // so there's no hidden video album to protect from this update either.
      await q(`UPDATE albums SET is_private=$2 WHERE id=$1 AND is_guest_album=false`, [id, is_private]);
    }
  }
  // is_unlisted (db/016) — same guard shape as is_private above; degrades
  // to a no-op on an unmigrated DB rather than 500ing the whole request.
  if (is_unlisted !== undefined) {
    try { await q(`UPDATE albums SET is_unlisted=$2 WHERE id=$1 AND is_guest_album=false AND is_video_album=false`, [id, is_unlisted]); } catch {}
  }
  if (name) await q(`UPDATE albums SET name=$2 WHERE id=$1`, [id, name]);
  if (cover_asset_id !== undefined) await q(`UPDATE albums SET cover_asset_id=$2 WHERE id=$1`, [id, cover_asset_id]);
  // showcase (db/016) — video source/autoplay/caption for a video showcase
  // album. Re-validated server-side (never trust the client's own URL
  // parsing) and the caption sanitized here, once, so the public page can
  // render it directly with no further sanitization at read time. Merged
  // into the existing jsonb (not overwritten) so this never wipes thumbKey,
  // which is set separately by the thumbnail upload route. Guarded to
  // is_showcase=true rows so this can't attach video config to an ordinary
  // photo album via a crafted request.
  if (showcase !== undefined) {
    const { videoUrl, autoplay, captionHtml } = showcase;
    const ref = videoUrl ? parseVideoUrl(videoUrl) : null;
    if (videoUrl && !ref) return NextResponse.json({ error: "Couldn't recognize that as a YouTube or Vimeo link." }, { status: 400 });
    const cleanCaption = sanitizeHtml(captionHtml || "", {
      allowedTags: ["b", "strong", "i", "em", "a", "br", "p"],
      allowedAttributes: { a: ["href", "target", "rel"] },
    });
    const payload = { videoSource: ref?.platform || null, videoUrl: videoUrl || null, autoplay: !!autoplay, captionHtml: cleanCaption };
    try {
      await q(`UPDATE albums SET showcase = COALESCE(showcase,'{}'::jsonb) || $2::jsonb WHERE id=$1 AND is_showcase=true`, [id, JSON.stringify(payload)]);
    } catch {
      return NextResponse.json({ error: "Couldn't save — has db/016_video_showcase_album.sql been applied?" }, { status: 409 });
    }
  }
  return NextResponse.json({ ok: true });
}
