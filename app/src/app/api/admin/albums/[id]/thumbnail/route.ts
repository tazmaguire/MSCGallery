/**
 * Video showcase album thumbnail (db/016_video_showcase_album.sql). Stored
 * on disk under THUMB_DIR, same as every other thumbnail/preview/poster in
 * this app — none of those ever live in R2 — mirroring the branding
 * logo/favicon upload's shape (api/admin/settings/upload) exactly: no
 * resize (the app container has no image-processing library; that's the
 * worker's job), just validate size/mimetype and write it straight through.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.THUMB_DIR || "/app/public/thumbs";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Max 5MB." }, { status: 400 });
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "Use PNG, WEBP, or JPEG." }, { status: 400 });

  const dir = path.join(ROOT, "showcase");
  await mkdir(dir, { recursive: true });
  const filename = `${params.id}-${Date.now()}.${ext}`; // unique -> cache-busts automatically on re-upload
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  const key = `showcase/${filename}`;

  try {
    await q(`UPDATE albums SET showcase = COALESCE(showcase,'{}'::jsonb) || jsonb_build_object('thumbKey', $2::text) WHERE id=$1 AND is_showcase=true`, [params.id, key]);
  } catch {
    return NextResponse.json({ error: "Couldn't save — has db/016_video_showcase_album.sql been applied?" }, { status: 409 });
  }
  return NextResponse.json({ url: `/thumbs/${key}` });
}
