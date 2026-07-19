import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t");
  const [l] = await q(
    `SELECT l.mode, l.is_active, g.name, g.brand, g.upload_terms, g.allow_uploads,
            g.max_files_per_session, g.max_session_bytes
     FROM upload_links l JOIN galleries g ON g.id=l.gallery_id
     WHERE l.token=$1 AND (l.expires_at IS NULL OR l.expires_at > now())`, [token]);
  if (!l || !l.is_active) return NextResponse.json({ error: "invalid" }, { status: 404 });
  return NextResponse.json({
    mode: l.mode, galleryName: l.name, brand: l.brand, terms: l.upload_terms,
    allowUploads: l.allow_uploads, maxFiles: l.max_files_per_session,
  });
}
