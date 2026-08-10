/**
 * Zip download — an album, or a whole gallery, in one file — plus the cart's
 * multi-select download (a specific list of asset ids).
 *
 * The trap this avoids: loading files into memory to zip them. On a 4GB VPS,
 * buffering a multi-GB gallery is an instant crash. So instead we STREAM — pull
 * each object from R2 and pipe it straight into a zip that flows out to the
 * client. Memory stays flat no matter how big the download.
 *
 * And we store with NO compression. JPEGs and MP4s are already compressed;
 * recompressing them burns CPU for ~0% gain. Store-only means the VPS is just
 * shovelling bytes R2 -> client with a zip wrapper around them, which even a
 * small box does comfortably and concurrently.
 *
 * This runs as a streaming response, so the browser gets a normal "Save file"
 * dialog and the download starts immediately rather than waiting for the whole
 * archive to be built first.
 *
 * Whole-gallery and whole-album downloads are admin-only (see getUser() check
 * below) — public visitors download one photo at a time via /d/[id], or a
 * cart selection via this same route with ?id= params. Cart downloads never
 * require login; everything else does.
 */
import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";
import { downloadFilename } from "@/lib/naming";
import { checkGalleryAccess, checkDownloadAccess, clientIp, hashIp, logDownload } from "@/lib/security";
import { getUser } from "@/lib/auth";
import archiver from "archiver";
import { PassThrough } from "node:stream";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // long downloads are fine

// Cart zips stream through the VPS (unlike single-photo downloads, which go
// straight to R2), so a cap here is what stops someone crafting a giant
// ?id=...&id=...&id=... request from tying up a worker thread. The client
// enforces the same cap for UX (a friendly message before it gets this far)
// — this is the real, unbypassable boundary.
const MAX_CART_IDS = 300;

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const albumSlug = url.searchParams.get("album"); // optional; absent = whole gallery
  const ids = url.searchParams.getAll("id"); // optional; a cart selection — overrides album
  if (ids.length > MAX_CART_IDS) return new Response(`Too many photos in one download (max ${MAX_CART_IDS}).`, { status: 400 });

  // Whole-gallery/whole-album (no ?id=) is an admin-only action and always
  // requires login. A cart selection (?id=...) never requires login — that's
  // how public visitors download — but if the requester HAPPENS to be a
  // logged-in admin, their selection can also reach a private album (e.g.
  // the hidden video album, db/009_video_album.sql) via GalleryManager's
  // "Download selected". An unauthenticated id-based request stays exactly
  // as restricted as before: a guest can only ever have selected ids from
  // what the public gallery actually rendered, which never includes private
  // albums, so this doesn't open anything up for them.
  const user = await getUser();
  const isAdmin = !!user;
  if (!ids.length && !isAdmin) return new Response("Sign in required for a bulk download.", { status: 403 });

  const [gallery] = await q(
    `SELECT * FROM galleries WHERE slug=$1 AND is_published`,
    [params.slug]
  );
  if (!gallery) return new Response("Not found", { status: 404 });
  // Admins are already authenticated via their own session — the separate
  // public password gate (and its gv_<id> cookie) is for guests, and an
  // admin using GalleryManager's Download buttons has no reason to have
  // gone through it. Without this, Download all/selected 403'd for any
  // admin on a password-protected gallery unless they happened to also
  // hold that cookie.
  if (!isAdmin && gallery.view_password_hash && !checkGalleryAccess(req.cookies.get(`gv_${gallery.id}`)?.value, gallery.id))
    return new Response("Locked", { status: 403 });
  if (!isAdmin && gallery.download_mode === "pin" && !checkDownloadAccess(req.cookies.get(`dp_${gallery.id}`)?.value, gallery.id))
    return new Response("PIN required", { status: 403 });

  // Gather what to include. Non-admin requests only ever see visible assets
  // in non-private albums — that half of the OR is the security boundary
  // for the public/guest case. A logged-in admin can reach private albums
  // either way (whole-album bulk, or their own id-based selection).
  const rows = await q(
    `SELECT a.id, a.public_key, a.kind, a.original_filename,
            al.name AS album_name, al.slug AS album_slug,
            COALESCE(c.credit_line, c.display_name) AS contributor,
            row_number() OVER (PARTITION BY a.album_id ORDER BY a.taken_at, a.created_at) AS seq
     FROM assets a
     JOIN albums al ON al.id = a.album_id
     JOIN contributors c ON c.id = a.contributor_id
     WHERE a.gallery_id = $1
       AND a.visibility = 'visible'
       AND a.status = 'ready'
       AND a.public_key IS NOT NULL
       AND (a.deletion_status IS NULL OR a.deletion_status = '')
       AND (al.is_private = false OR $4::boolean)
       AND ($2::text IS NULL OR al.slug = $2)
       AND ($3::uuid[] IS NULL OR a.id = ANY($3::uuid[]))
     ORDER BY al.sort_order, a.taken_at`,
    [gallery.id, ids.length ? null : albumSlug, ids.length ? ids : null, isAdmin]
  );

  if (!rows.length) return new Response("Nothing to download", { status: 404 });

  // db/014_download_logs.sql — one row per asset in this zip, best-effort,
  // done once up front (not inside the streaming IIFE below) so a slow log
  // insert never holds up time-to-first-byte. No dlname (e.g. an admin's
  // own bulk download) → nothing logged.
  const dlname = url.searchParams.get("dlname");
  if (dlname) logDownload(gallery.id, rows.map((r: any) => r.id), dlname, url.searchParams.get("dlemail"), "zip", hashIp(clientIp(req)));

  const zipName = ids.length
    ? `${gallery.short_code}_selected.zip`
    : albumSlug
    ? `${gallery.short_code}_${albumSlug}.zip`
    : `${gallery.short_code}_all.zip`;

  const archive = archiver("zip", { store: true }); // STORE, not deflate
  const out = new PassThrough();
  archive.pipe(out);
  // Swallow archiver's own async warnings/errors (e.g. a stream that broke
  // mid-append) rather than letting them crash the process — the per-item
  // try/catch below already handles the common case (object missing
  // entirely); this is the backstop for the rarer mid-stream failure.
  archive.on("warning", (e) => console.error("zip warning:", e.message));
  archive.on("error", (e) => console.error("zip error:", e.message));

  // Feed the archive. Each entry is a fresh stream from R2; archiver applies
  // backpressure, so we never pull faster than the client drains. One bad or
  // missing key must not take down the whole download — skip it and keep
  // going, so a single stale R2 object doesn't 502 the entire zip.
  (async () => {
    try {
      for (const r of rows) {
        try {
          // Photos: always our own "pub/xx/id.jpg" deliverable, so "jpg" is
          // exact. Videos: since db/009_video_album.sql, public_key just
          // points at the original upload (never re-encoded — see the
          // worker's derive()), which can be any container an admin's phone
          // or camera produced, so take the extension from the actual key
          // rather than assuming mp4.
          const ext = r.kind === "video" ? (r.public_key.split(".").pop() || "mp4") : "jpg";
          const name = downloadFilename({
            shortCode: gallery.short_code,
            location: gallery.location,
            contributor: r.contributor,
            seq: Number(r.seq),
            ext,
          });

          // Put each album in its own folder inside the zip when grabbing the
          // whole gallery or a cart selection that may span albums. For a single
          // album, flat is nicer.
          const path = albumSlug && !ids.length ? name : `${r.album_slug}/${name}`;

          const body = await getObjectStream(r.public_key);
          archive.append(body as any, { name: path });
        } catch (e) {
          console.error(`zip: skipping ${r.public_key} — ${(e as Error).message}`);
        }
      }
      await archive.finalize();
    } catch (e) {
      archive.abort();
      out.destroy(e as Error);
    }
  })();

  return new Response(out as any, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
    },
  });
}
