import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
export async function GET(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const albumId = new URL(req.url).searchParams.get("album");
  const rows = await q(
    `SELECT a.id, a.kind, a.visibility, a.thumb_key, a.bytes, a.original_filename, a.source, a.album_id,
            c.first_name, c.display_name AS contributor
     FROM assets a JOIN contributors c ON c.id=a.contributor_id
     WHERE a.album_id=$1 AND a.deletion_status IS NULL ORDER BY a.taken_at DESC NULLS LAST, a.created_at DESC`, [albumId]);
  return NextResponse.json({ assets: rows });
}
export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { assetIds, albumId } = await req.json();
  await q(`UPDATE assets SET album_id=$2 WHERE id = ANY($1::uuid[])`, [assetIds, albumId]);
  return NextResponse.json({ moved: assetIds.length });
}
