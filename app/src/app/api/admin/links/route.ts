import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { firstName } from "@/lib/naming";
import { audit, clientIp, hashIp } from "@/lib/security";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

export async function GET(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const gid = new URL(req.url).searchParams.get("gallery");
  // Revoked links are soft-deleted (is_active=false) so uploaded photos and
  // audit history survive — but they should disappear from this list the
  // moment they're revoked, not linger looking clickable.
  // db/015_link_no_limits.sql — best-effort: an older DB without it just
  // shows every link as capped (no_limits defaults to false client-side).
  let links;
  try {
    links = await q(
      `SELECT l.id, l.mode, l.token, l.label, l.is_active, l.target_album_id, l.no_limits,
              c.display_name AS contributor_name, al.name AS album_name
       FROM upload_links l LEFT JOIN contributors c ON c.id=l.contributor_id
       LEFT JOIN albums al ON al.id=l.target_album_id
       WHERE l.gallery_id=$1 AND l.is_active ORDER BY l.created_at DESC`, [gid]);
  } catch {
    links = await q(
      `SELECT l.id, l.mode, l.token, l.label, l.is_active, l.target_album_id,
              c.display_name AS contributor_name, al.name AS album_name
       FROM upload_links l LEFT JOIN contributors c ON c.id=l.contributor_id
       LEFT JOIN albums al ON al.id=l.target_album_id
       WHERE l.gallery_id=$1 AND l.is_active ORDER BY l.created_at DESC`, [gid]);
  }
  return NextResponse.json({ links });
}

export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { galleryId, mode, pin, contributorName, creditLine, targetAlbumId, label, noLimits } = await req.json();
  const token = crypto.randomBytes(18).toString("base64url");

  let pin_hash = null, contributorId = null;
  if (mode === "pin") {
    if (!pin || String(pin).length < 4) return NextResponse.json({ error: "PIN must be at least 4 digits." }, { status: 400 });
    pin_hash = await bcrypt.hash(String(pin), 10);
  }
  if (mode === "photographer") {
    if (!contributorName?.trim()) return NextResponse.json({ error: "Name the photographer." }, { status: 400 });
    const nm = contributorName.trim();
    const [ex] = await q(`SELECT id FROM contributors WHERE is_guest=false AND lower(display_name)=lower($1) LIMIT 1`, [nm]);
    contributorId = ex?.id ?? (await q(
      `INSERT INTO contributors (display_name, first_name, credit_line, is_guest) VALUES ($1,$2,$3,false) RETURNING id`,
      [nm, firstName(nm), creditLine || null]))[0].id;
  }

  // db/015_link_no_limits.sql — best-effort: an older DB without it just
  // creates the link capped as before, rather than failing the whole thing.
  let link;
  try {
    [link] = await q(
      `INSERT INTO upload_links (gallery_id, token, mode, pin_hash, contributor_id, target_album_id, label, no_limits)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [galleryId, token, mode, pin_hash, contributorId, targetAlbumId || null, label || null, !!noLimits]);
  } catch {
    [link] = await q(
      `INSERT INTO upload_links (gallery_id, token, mode, pin_hash, contributor_id, target_album_id, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [galleryId, token, mode, pin_hash, contributorId, targetAlbumId || null, label || null]);
  }
  await audit(user.id, "create_link", { galleryId, mode }, hashIp(clientIp(req)));
  return NextResponse.json({ ...link, token });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { id, noLimits } = await req.json();
  if (!id) return NextResponse.json({ error: "No link specified." }, { status: 400 });
  try {
    await q(`UPDATE upload_links SET no_limits=$2 WHERE id=$1`, [id, !!noLimits]);
  } catch {
    return NextResponse.json({ error: "Couldn't save — has db/015_link_no_limits.sql been applied?" }, { status: 409 });
  }
  await audit(user.id, noLimits ? "link_no_limits_on" : "link_no_limits_off", { id }, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { id } = await req.json();
  // Soft-delete only — the link stops working and drops out of the list, but
  // photos already uploaded through it aren't touched (assets FK to the
  // gallery/album/contributor, never to the link itself).
  await q(`UPDATE upload_links SET is_active=false WHERE id=$1`, [id]);
  await audit(user.id, "revoke_link", { id }, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}
