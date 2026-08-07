import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";

export async function GET() {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  try {
    const [row] = await q(`SELECT * FROM site_settings WHERE id=true`);
    return NextResponse.json({ settings: row || null });
  } catch {
    return NextResponse.json({ settings: null });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const body = await req.json();
  const { name, tagline, primary_color, accent_color, theme, footer_text, contact_email, display_mode, gallery_sort_mode } = body;

  // gallery_sort_mode is its own branch, on purpose, in two ways: it's
  // settable by any admin (the galleries list sort dropdown any admin sees —
  // owner-gating just this field would silently 403 a non-owner exactly like
  // the categories bug did), and the branding UPSERT below unconditionally
  // rewrites every branding column on every call — routing this through it
  // would null out the owner's saved name/colours/etc whenever a non-owner
  // (or the sort dropdown alone) only meant to change the sort order.
  if (gallery_sort_mode !== undefined) {
    const validModes = ["date_asc", "date_desc", "name_asc", "name_desc", "custom"];
    const mode = validModes.includes(gallery_sort_mode) ? gallery_sort_mode : null;
    try {
      await q(
        `INSERT INTO site_settings (id, gallery_sort_mode, updated_at) VALUES (true, $1, now())
         ON CONFLICT (id) DO UPDATE SET gallery_sort_mode=$1, updated_at=now()`, [mode]);
    } catch {
      return NextResponse.json({ error: "Couldn't save — has db/012_gallery_sort_mode.sql been applied?" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  if (user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const t = theme === "light" || theme === "dark" ? theme : null;
  const d = display_mode === "logo" || display_mode === "name" || display_mode === "both" ? display_mode : null;
  try {
    await q(
      `INSERT INTO site_settings (id, name, tagline, primary_color, accent_color, theme, footer_text, contact_email, display_mode, updated_at)
       VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (id) DO UPDATE SET
         name=$1, tagline=$2, primary_color=$3, accent_color=$4, theme=$5, footer_text=$6, contact_email=$7, display_mode=$8, updated_at=now()`,
      [name?.trim() || null, tagline?.trim() || null, primary_color || null, accent_color || null, t, footer_text?.trim() || null, contact_email?.trim() || null, d]);
  } catch {
    return NextResponse.json({ error: "Couldn't save — has db/005_site_settings.sql and db/006_site_display_mode.sql been applied?" }, { status: 409 });
  }
  await audit(user.id, "update_site_settings", null, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}
