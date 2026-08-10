import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import bcrypt from "bcryptjs";
import { clientIp, hashIp, pinLocked, pinFail, pinReset, downloadAccessToken } from "@/lib/security";

export async function POST(req: NextRequest) {
  const { slug, pin } = await req.json();
  const [g] = await q(`SELECT id, download_mode, download_pin_hash FROM galleries WHERE slug=$1 AND is_published`, [slug]).catch(() => [] as any);
  if (!g || g.download_mode !== "pin" || !g.download_pin_hash) return NextResponse.json({ error: "This gallery's downloads aren't PIN protected." }, { status: 400 });

  const iph = hashIp(clientIp(req));
  const lockKey = `gallery-dl-pin:${g.id}:${iph}`;
  const locked = await pinLocked(lockKey);
  if (locked) return NextResponse.json({ error: `Too many attempts. Try again in ${locked}s.` }, { status: 429 });

  if (!pin || !(await bcrypt.compare(String(pin), g.download_pin_hash))) {
    await pinFail(lockKey);
    return NextResponse.json({ error: "That PIN isn't right." }, { status: 403 });
  }
  await pinReset(lockKey);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(`dp_${g.id}`, downloadAccessToken(g.id), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
