import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";

export async function GET() {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  try {
    const categories = await q(`SELECT * FROM gallery_categories ORDER BY sort_order, name`);
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ categories: [] });
  }
}

export async function POST(req: NextRequest) {
  // Any logged-in admin, not owners only — this is created inline from the
  // gallery Access panel, which every admin (not just owners) already has
  // access to. Owner-gating just this call was the bug: a moderator could
  // open that panel and have "Add" silently 403 with no error shown.
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { name } = await req.json();
  const clean = (name || "").trim();
  if (!clean) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  try {
    const [c] = await q(`INSERT INTO gallery_categories (name, slug) VALUES ($1,$2) RETURNING *`, [clean, slug]);
    await audit(user.id, "create_category", { name: clean }, hashIp(clientIp(req)));
    return NextResponse.json(c);
  } catch {
    // Most likely a duplicate name (UNIQUE constraint) — resolve to the
    // existing category instead of failing, so re-typing "Sport" a second
    // time just selects it rather than erroring.
    const [existing] = await q(`SELECT * FROM gallery_categories WHERE lower(name)=lower($1)`, [clean]);
    if (existing) return NextResponse.json(existing);
    return NextResponse.json({ error: "Couldn't create — has db/007_config_and_categories.sql been applied?" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const { id } = await req.json();
  await q(`DELETE FROM gallery_categories WHERE id=$1`, [id]);
  await audit(user.id, "delete_category", { id }, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}
