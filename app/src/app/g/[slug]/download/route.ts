/**
 * Zip download — an album, or a whole gallery, in one file.
 *
 * The trap this avoids: loading files into memory to zip them. On a 4GB VPS,
 * buffering a multi-GB gallery is an instant crash. So instead we STREAM — pull
 * each object from B2 and pipe it straight into a zip that flows out to the
 * client. Memory stays flat no matter how big the download.
 *
 * And we store with NO compression. JPEGs and MP4s are already compressed;
 * recompressing them burns CPU for ~0% gain. Store-only means the VPS is just
 * shovelling bytes B2 -> client with a zip wrapper around them, which even a
 * small box does comfortably and concurrently.
 *
 * This runs as a streaming response, so the browser gets a normal "Save file"
 * dialog and the download starts immediately rather than waiting for the whole
 * archive to be built first.
 */
import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";
import { downloadFilename } from "@/lib/naming";
import archiver from "archiver";
import { PassThrough } from "node:stream";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // long downloads are fine

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const albumSlug = url.searchParams.get("album"); // optional; absent = whole gallery
  const ids = url.searchParams.getAll("id"); // optional; a cart selection — overrides album

  const [gallery] = await q(
    `SELECT * FROM galleries WHERE slug=$1 AND is_published`,
    [params.slug]
  );
  if (!gallery) return new Response("Not found", { status: 404 });

  // Gather what to include. Public downloads only ever see visible assets in
  // non-private albums — the query is the security boundary.
  const rows = await q(
    `SELECT a.public_key, a.kind, a.original_filename,
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
       AND a.deletion_status IS NULL
       AND al.is_private = false
       AND ($2::text IS NULL OR al.slug = $2)
       AND ($3::uuid[] IS NULL OR a.id = ANY($3::uuid[]))
     ORDER BY al.sort_order, a.taken_at`,
    [gallery.id, ids.length ? null : albumSlug, ids.length ? ids : null]
  );

  if (!rows.length) return new Response("Nothing to download", { status: 404 });

  const zipName = ids.length
    ? `${gallery.short_code}_selected.zip`
    : albumSlug
    ? `${gallery.short_code}_${albumSlug}.zip`
    : `${gallery.short_code}_all.zip`;

  const archive = archiver("zip", { store: true }); // STORE, not deflate
  const out = new PassThrough();
  archive.pipe(out);

  // Feed the archive. Each entry is a fresh stream from B2; archiver applies
  // backpressure, so we never pull faster than the client drains.
  (async () => {
    try {
      for (const r of rows) {
        const ext = r.kind === "video" ? "mp4" : "jpg";
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
