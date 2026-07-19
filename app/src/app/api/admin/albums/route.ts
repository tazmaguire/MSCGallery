import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
export async function GET(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const gid = new URL(req.url).searchParams.get("gallery");
  const albums = await q(
    `SELECT al.*, (SELECT count(*) FROM assets a WHERE a.album_id=al.id AND a.visibility='visible') AS visible
     FROM albums al WHERE al.gallery_id=$1 ORDER BY al.sort_order, al.created_at`, [gid]);
  return NextResponse.json({ albums });
}
export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { galleryId, name, isPrivate } = await req.json();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const [a] = await q(
    `INSERT INTO albums (gallery_id, name, slug, is_private, sort_order)
     VALUES ($1,$2,$3,$4, COALESCE((SELECT max(sort_order)+1 FROM albums WHERE gallery_id=$1),0)) RETURNING *`,
    [galleryId, name, slug, !!isPrivate]);
  return NextResponse.json(a);
}
export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { id, is_private, name, cover_asset_id } = await req.json();
  if (is_private !== undefined) await q(`UPDATE albums SET is_private=$2 WHERE id=$1 AND is_guest_album=false`, [id, is_private]);
  if (name) await q(`UPDATE albums SET name=$2 WHERE id=$1`, [id, name]);
  if (cover_asset_id !== undefined) await q(`UPDATE albums SET cover_asset_id=$2 WHERE id=$1`, [id, cover_asset_id]);
  return NextResponse.json({ ok: true });
}
