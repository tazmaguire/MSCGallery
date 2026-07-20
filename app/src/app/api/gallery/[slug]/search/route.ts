/**
 * Public bib-number search — proves the H tagging retrieval path end to end
 * even with only manual tags. Same visibility rule and password gate as the
 * gallery page itself; degrades to an empty result set (not an error) if
 * db/003_tagging.sql hasn't been applied yet.
 */
import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { downloadFilename, firstName } from "@/lib/naming";
import { checkGalleryAccess } from "@/lib/security";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const bib = new URL(req.url).searchParams.get("bib")?.trim();
  if (!bib) return NextResponse.json({ assets: [] });

  const [g] = await q(`SELECT * FROM galleries WHERE slug=$1 AND is_published`, [params.slug]);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (g.view_password_hash && !checkGalleryAccess(req.cookies.get(`gv_${g.id}`)?.value, g.id))
    return NextResponse.json({ error: "Locked" }, { status: 403 });

  try {
    const rows = await q(
      `SELECT a.id, a.kind, a.width, a.height, a.album_id, a.thumb_key, a.preview_key, a.poster_key, a.contributor_id,
              COALESCE(c.credit_line, c.display_name) AS contributor_name, c.first_name,
              row_number() OVER (ORDER BY a.taken_at, a.created_at) AS seq
       FROM asset_tags t
       JOIN assets a ON a.id = t.asset_id
       JOIN contributors c ON c.id = a.contributor_id
       JOIN albums al ON al.id = a.album_id
       WHERE t.tag_type = 'bib' AND t.value = $2
         AND a.gallery_id = $1 AND a.visibility = 'visible' AND a.status = 'ready'
         AND (a.deletion_status IS NULL OR a.deletion_status = '') AND al.is_private = false
       ORDER BY a.taken_at, a.created_at`,
      [g.id, bib]
    );
    const assets = rows.map((r: any) => {
      const ext = r.kind === "video" ? "mp4" : "jpg";
      return {
        id: r.id, kind: r.kind, width: r.width, height: r.height, contributor_id: r.contributor_id,
        firstName: r.first_name || firstName(r.contributor_name),
        download_filename: downloadFilename({ shortCode: g.short_code, location: g.location, contributor: r.contributor_name, seq: Number(r.seq), ext }),
        download_url: `/d/${r.id}`,
        thumb: `/thumbs/thumb/${r.thumb_key}`,
        preview: `/thumbs/preview/${r.preview_key || r.poster_key}`,
      };
    });
    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ assets: [] });
  }
}
