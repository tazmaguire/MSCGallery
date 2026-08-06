import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const DEFAULT_TERMS =
  "You keep copyright of any photo or video you upload. By uploading, you grant Memorial Stair Climb an irrevocable, royalty-free, non-exclusive licence to use, reproduce, and share your images for promotional, advertising, fundraising, and archival purposes. You confirm the content is yours to share and that you're happy for it to appear in the event gallery.";

export async function GET() {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  let galleries;
  try {
    // Storage occupied by everything currently in R2 for this gallery: the
    // original upload (bytes, since db/001) plus the re-encoded deliverable
    // (public_bytes, db/008_asset_public_bytes.sql) — thumb/preview/poster
    // live on local disk, not R2, so they don't count.
    galleries = await q(
      `SELECT g.*, gc.name AS category_name,
         (SELECT count(*) FROM assets a WHERE a.gallery_id=g.id AND a.visibility='visible' AND (a.deletion_status IS NULL OR a.deletion_status='')) AS visible,
         (SELECT count(*) FROM assets a WHERE a.gallery_id=g.id AND a.visibility='pending' AND a.status='ready' AND (a.deletion_status IS NULL OR a.deletion_status='')) AS pending,
         (SELECT COALESCE(SUM(COALESCE(a.bytes,0) + COALESCE(a.public_bytes,0)),0) FROM assets a WHERE a.gallery_id=g.id) AS storage_bytes
       FROM galleries g LEFT JOIN gallery_categories gc ON gc.id=g.category_id ORDER BY g.event_date DESC NULLS LAST`);
  } catch {
    // db/007_config_and_categories.sql and/or db/008_asset_public_bytes.sql
    // not applied yet — fall back to no category join, storage from
    // original-upload bytes only (that column has always existed).
    galleries = await q(
      `SELECT g.*,
         (SELECT count(*) FROM assets a WHERE a.gallery_id=g.id AND a.visibility='visible' AND (a.deletion_status IS NULL OR a.deletion_status='')) AS visible,
         (SELECT count(*) FROM assets a WHERE a.gallery_id=g.id AND a.visibility='pending' AND a.status='ready' AND (a.deletion_status IS NULL OR a.deletion_status='')) AS pending,
         (SELECT COALESCE(SUM(a.bytes),0) FROM assets a WHERE a.gallery_id=g.id) AS storage_bytes
       FROM galleries g ORDER BY g.event_date DESC NULLS LAST`);
  }
  return NextResponse.json({ galleries });
}

export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const { name, slug, short_code, event_date, location, primary, accent } = await req.json();
  const token = crypto.randomBytes(18).toString("base64url");
  const [g] = await q(
    `INSERT INTO galleries (name, slug, short_code, event_date, location, brand, upload_terms, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,false) RETURNING *`,
    [name, slug, short_code.toUpperCase(), event_date || null, location || null,
     JSON.stringify({ primary: primary || "#E8442A", accent: accent || "#D6E04B" }), DEFAULT_TERMS]);
  const [guest] = await q(
    `INSERT INTO albums (gallery_id, name, slug, is_guest_album, sort_order) VALUES ($1,'Guest Photos','guest',true,100) RETURNING id`, [g.id]);
  // Auto-create an open link so the QR works immediately
  await q(`INSERT INTO upload_links (gallery_id, token, mode, label) VALUES ($1,$2,'open','Open QR (on the day)')`,
    [g.id, crypto.randomBytes(18).toString("base64url")]);
  await q(`UPDATE galleries SET guest_album_id=$2 WHERE id=$1`, [g.id, guest.id]);
  await audit(user.id, "create_gallery", { slug }, hashIp(clientIp(req)));
  return NextResponse.json(g);
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { id, brand, upload_terms, is_published, allow_uploads, name, location,
          max_files_per_session, max_session_bytes, max_file_bytes, cover_asset_id, view_password,
          category_id, is_unlisted } = await req.json();
  if (brand !== undefined) await q(`UPDATE galleries SET brand=$2 WHERE id=$1`, [id, JSON.stringify(brand)]);
  if (upload_terms !== undefined) await q(`UPDATE galleries SET upload_terms=$2 WHERE id=$1`, [id, upload_terms]);
  if (is_published !== undefined) await q(`UPDATE galleries SET is_published=$2 WHERE id=$1`, [id, is_published]);
  if (allow_uploads !== undefined) await q(`UPDATE galleries SET allow_uploads=$2 WHERE id=$1`, [id, allow_uploads]);
  if (name) await q(`UPDATE galleries SET name=$2 WHERE id=$1`, [id, name]);
  if (location !== undefined) await q(`UPDATE galleries SET location=$2 WHERE id=$1`, [id, location]);
  if (max_files_per_session) await q(`UPDATE galleries SET max_files_per_session=$2 WHERE id=$1`, [id, max_files_per_session]);
  if (max_session_bytes) await q(`UPDATE galleries SET max_session_bytes=$2 WHERE id=$1`, [id, max_session_bytes]);
  if (max_file_bytes) await q(`UPDATE galleries SET max_file_bytes=$2 WHERE id=$1`, [id, max_file_bytes]);
  if (cover_asset_id !== undefined) await q(`UPDATE galleries SET cover_asset_id=$2 WHERE id=$1`, [id, cover_asset_id]);
  // category_id/is_unlisted are db/007_config_and_categories.sql columns — the
  // Access modal always sends both alongside view_password, so on a DB that
  // hasn't had 007 applied yet this must degrade quietly rather than 500 and
  // block setting a password (which has no such dependency).
  if (category_id !== undefined) { try { await q(`UPDATE galleries SET category_id=$2 WHERE id=$1`, [id, category_id || null]); } catch {} }
  if (is_unlisted !== undefined) { try { await q(`UPDATE galleries SET is_unlisted=$2 WHERE id=$1`, [id, is_unlisted]); } catch {} }
  // view_password: "" clears protection, a non-empty string sets a new password, omitted = unchanged.
  if (view_password !== undefined) {
    const hash = view_password.trim() ? await bcrypt.hash(view_password.trim(), 12) : null;
    await q(`UPDATE galleries SET view_password_hash=$2 WHERE id=$1`, [id, hash]);
    await audit(user.id, hash ? "set_gallery_password" : "clear_gallery_password", { id }, hashIp(clientIp(req)));
  }
  return NextResponse.json({ ok: true });
}
