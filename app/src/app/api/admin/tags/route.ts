import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const url = new URL(req.url);
  const assetId = url.searchParams.get("asset");
  const galleryId = url.searchParams.get("gallery");
  const value = url.searchParams.get("value")?.trim();

  try {
    if (assetId) {
      const tags = await q(`SELECT id, tag_type, value, source, created_at FROM asset_tags WHERE asset_id=$1 ORDER BY created_at`, [assetId]);
      return NextResponse.json({ tags });
    }
    if (galleryId && value) {
      // Admin search — unlike the public bib search, this isn't limited to
      // already-approved photos, so staff can find and moderate a tagged photo.
      const assets = await q(
        `SELECT a.id, a.kind, a.visibility, a.thumb_key, a.album_id,
                c.first_name, c.display_name AS contributor
         FROM asset_tags t JOIN assets a ON a.id = t.asset_id JOIN contributors c ON c.id = a.contributor_id
         WHERE a.gallery_id = $1 AND t.value = $2 AND (a.deletion_status IS NULL OR a.deletion_status = '')
         ORDER BY a.created_at DESC`,
        [galleryId, value]
      );
      return NextResponse.json({ assets });
    }
    return NextResponse.json({ error: "asset or gallery+value required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Tagging isn't set up yet — has db/003_tagging.sql been applied?" }, { status: 409 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { assetId, tagType, value } = await req.json();
  if (!assetId || !value?.trim()) return NextResponse.json({ error: "assetId and value are required." }, { status: 400 });
  const type = ["bib", "face", "text", "manual"].includes(tagType) ? tagType : "bib";
  try {
    const [tag] = await q(
      `INSERT INTO asset_tags (asset_id, tag_type, value, source, created_by) VALUES ($1,$2,$3,'manual',$4) RETURNING id, tag_type, value, source, created_at`,
      [assetId, type, value.trim(), user.id]);
    await audit(user.id, "add_tag", { assetId, tagType: type, value: value.trim() }, hashIp(clientIp(req)));
    return NextResponse.json({ tag });
  } catch {
    return NextResponse.json({ error: "Tagging isn't set up yet — has db/003_tagging.sql been applied?" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { id } = await req.json();
  await q(`DELETE FROM asset_tags WHERE id=$1`, [id]);
  await audit(user.id, "remove_tag", { id }, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}
