/**
 * Site logo/favicon upload. Stored on disk under the SAME root as
 * thumbnails (THUMB_DIR, e.g. /app/public/thumbs -> host /srv/msc-thumbs),
 * in a branding/ subdirectory, served by the existing nginx /thumbs/
 * location — no new bind mount or nginx config needed. Not R2: this is
 * small, rarely-changed, app-identity data, not per-event photo content.
 * Files land owned by the already-running app process (uid 100), so no
 * extra chown step is needed beyond what docker-entrypoint.sh already does
 * for the rest of the thumbs tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { audit, clientIp, hashIp } from "@/lib/security";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.THUMB_DIR || "/app/public/thumbs";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg",
  "image/svg+xml": "svg", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
};

export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const type = form.get("type");
  if (!file || (type !== "logo" && type !== "favicon"))
    return NextResponse.json({ error: "Missing file or type." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Max 5MB." }, { status: 400 });
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "Use PNG, WEBP, JPEG, SVG, or ICO." }, { status: 400 });

  const dir = path.join(ROOT, "branding");
  await mkdir(dir, { recursive: true });
  const filename = `${type}-${Date.now()}.${ext}`; // unique name -> cache-busts automatically on re-upload
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  const key = `branding/${filename}`;

  try {
    if (type === "logo") {
      await q(
        `INSERT INTO site_settings (id, logo_key, updated_at) VALUES (true, $1, now())
         ON CONFLICT (id) DO UPDATE SET logo_key = EXCLUDED.logo_key, updated_at = now()`, [key]);
    } else {
      await q(
        `INSERT INTO site_settings (id, favicon_key, updated_at) VALUES (true, $1, now())
         ON CONFLICT (id) DO UPDATE SET favicon_key = EXCLUDED.favicon_key, updated_at = now()`, [key]);
    }
  } catch {
    return NextResponse.json({ error: "Couldn't save — has db/005_site_settings.sql been applied?" }, { status: 409 });
  }
  await audit(user.id, "update_site_settings", { [`${type}_key`]: key }, hashIp(clientIp(req)));
  return NextResponse.json({ url: `/thumbs/${key}` });
}
