import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
const ROOT = process.env.THUMB_DIR || "/app/public/thumbs";
function eq(a: string, b: string) { const A = Buffer.from(a), B = Buffer.from(b); return A.length === B.length && timingSafeEqual(A, B); }
export async function POST(req: NextRequest) {
  const s = req.headers.get("x-worker-secret") || "";
  if (!process.env.WORKER_SHARED_SECRET || !eq(s, process.env.WORKER_SHARED_SECRET)) return NextResponse.json({ error: "no" }, { status: 401 });
  const kind = req.headers.get("x-derivative-kind") || ""; const key = req.headers.get("x-derivative-key") || "";
  if (!["thumb", "preview", "poster"].includes(kind) || !/^[\w.\-]+$/.test(key)) return NextResponse.json({ error: "bad" }, { status: 400 });
  const dir = path.join(ROOT, kind); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), Buffer.from(await req.arrayBuffer()));
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const s = req.headers.get("x-worker-secret") || "";
  if (!process.env.WORKER_SHARED_SECRET || !eq(s, process.env.WORKER_SHARED_SECRET)) return NextResponse.json({ error: "no" }, { status: 401 });
  const { keys } = await req.json();
  for (const kind of ["thumb", "preview", "poster"]) for (const key of keys as string[]) {
    if (!/^[\w.\-]+$/.test(key)) continue;
    try { await unlink(path.join(ROOT, kind, key)); } catch {}
  }
  return NextResponse.json({ ok: true });
}
