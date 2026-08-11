import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Self-update status/trigger. Reads/writes deploy/data/update/ (bind-mounted
 * into this container at /app/update-state — see docker-compose.yml), which
 * deploy/update-watcher.sh polls on the HOST. This route never runs git or
 * Docker itself — it can only report what the watcher last wrote, and drop
 * an empty `request` file for the watcher to notice. See "Self-update" in
 * HANDOFF.md for the full picture and the one-time install step this needs.
 */
const STATE_DIR = "/app/update-state";

export async function GET() {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  let status: any = null;
  try { status = JSON.parse(await fs.readFile(path.join(STATE_DIR, "status.json"), "utf8")); } catch {}
  let log = "";
  try { log = (await fs.readFile(path.join(STATE_DIR, "update.log"), "utf8")).split("\n").slice(-40).join("\n"); } catch {}
  return NextResponse.json({ status, log, deployedSha: process.env.BUILD_SHA || null, watcherInstalled: !!status });
}

export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(path.join(STATE_DIR, "request"), "");
  } catch {
    return NextResponse.json({ error: "Couldn't request an update — the updater isn't installed on this server yet. See \"Self-update\" in HANDOFF.md." }, { status: 500 });
  }
  await audit(user.id, "request_update", {}, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}
