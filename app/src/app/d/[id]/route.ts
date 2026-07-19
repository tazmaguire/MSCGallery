/**
 * Download redirect. /d/<assetId> → 302 to a short-lived presigned R2 URL.
 *
 * Why a redirect instead of baking URLs into the page:
 *  - the bucket stays private; links are signed and expire (~15 min)
 *  - we re-check the asset is visible and in a public album at click time
 *  - the file streams straight from R2 to the user (free egress), not via the VPS
 */
import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { presignDownload } from "@/lib/storage";
import { downloadFilename, firstName } from "@/lib/naming";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const [a] = await q(
    `SELECT a.public_key, a.kind, a.gallery_id,
            g.short_code, g.location,
            COALESCE(c.credit_line, c.display_name) AS contributor,
            al.is_private,
            row_number() OVER (PARTITION BY a.album_id ORDER BY a.taken_at, a.created_at) AS seq
     FROM assets a
     JOIN galleries g ON g.id = a.gallery_id
     JOIN contributors c ON c.id = a.contributor_id
     JOIN albums al ON al.id = a.album_id
     WHERE a.id = $1 AND a.visibility='visible' AND a.status='ready'
       AND a.public_key IS NOT NULL AND a.deletion_status IS NULL
       AND al.is_private = false AND g.is_published = true`,
    [params.id]
  );
  if (!a) return new Response("Not found", { status: 404 });

  const ext = a.kind === "video" ? "mp4" : "jpg";
  const name = downloadFilename({ shortCode: a.short_code, location: a.location, contributor: a.contributor, seq: Number(a.seq), ext });
  const url = await presignDownload(a.public_key, name);
  return NextResponse.redirect(url, 302);
}
