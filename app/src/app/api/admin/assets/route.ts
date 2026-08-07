import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { firstName } from "@/lib/naming";
import { audit, clientIp, hashIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const albumId = new URL(req.url).searchParams.get("album");
  let rows;
  try {
    rows = await q(
      `SELECT a.id, a.kind, a.visibility, a.thumb_key, a.bytes, a.original_filename, a.source, a.album_id,
              COALESCE(a.taken_at, a.created_at) AS date,
              c.first_name, c.display_name AS contributor, c.link_url AS contributor_link
       FROM assets a JOIN contributors c ON c.id=a.contributor_id
       WHERE a.album_id=$1 AND a.deletion_status IS NULL ORDER BY a.taken_at DESC NULLS LAST, a.created_at DESC`, [albumId]);
  } catch {
    // db/010_contributor_link.sql not applied yet.
    rows = await q(
      `SELECT a.id, a.kind, a.visibility, a.thumb_key, a.bytes, a.original_filename, a.source, a.album_id,
              COALESCE(a.taken_at, a.created_at) AS date,
              c.first_name, c.display_name AS contributor
       FROM assets a JOIN contributors c ON c.id=a.contributor_id
       WHERE a.album_id=$1 AND a.deletion_status IS NULL ORDER BY a.taken_at DESC NULLS LAST, a.created_at DESC`, [albumId]);
  }
  return NextResponse.json({ assets: rows });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { assetIds, albumId, creditName, creditLink } = await req.json();
  if (!assetIds?.length) return NextResponse.json({ error: "no assets" }, { status: 400 });
  if (albumId) await q(`UPDATE assets SET album_id=$2 WHERE id = ANY($1::uuid[])`, [assetIds, albumId]);
  if (creditName?.trim()) {
    await q(
      `UPDATE contributors SET display_name=$2, first_name=$3
       WHERE id IN (SELECT contributor_id FROM assets WHERE id = ANY($1::uuid[]))`,
      [assetIds, creditName.trim(), firstName(creditName.trim())]);
    await audit(user.id, "edit_credit", { assetIds, creditName: creditName.trim() }, hashIp(clientIp(req)));
  }
  // "" clears the link, a non-empty string sets it, omitted (undefined) leaves
  // it unchanged — same convention as the gallery password field.
  if (creditLink !== undefined) {
    try {
      await q(
        `UPDATE contributors SET link_url=$2
         WHERE id IN (SELECT contributor_id FROM assets WHERE id = ANY($1::uuid[]))`,
        [assetIds, creditLink.trim() || null]);
      await audit(user.id, "edit_credit_link", { assetIds }, hashIp(clientIp(req)));
    } catch {
      return NextResponse.json({ error: "Couldn't save the link — has db/010_contributor_link.sql been applied?" }, { status: 409 });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const { assetIds } = await req.json();
  if (!assetIds?.length) return NextResponse.json({ error: "no assets" }, { status: 400 });
  // Hide immediately (every public/queue query already excludes deletion_status
  // IS NOT NULL); the worker's purge job removes the storage bytes + row after.
  await q(`UPDATE assets SET deletion_status='pending' WHERE id = ANY($1::uuid[])`, [assetIds]);
  await q(`INSERT INTO jobs (type, asset_id) SELECT 'purge', id FROM assets WHERE id = ANY($1::uuid[])`, [assetIds]);
  await audit(user.id, "delete_assets", { count: assetIds.length }, hashIp(clientIp(req)));
  return NextResponse.json({ deleted: assetIds.length });
}
