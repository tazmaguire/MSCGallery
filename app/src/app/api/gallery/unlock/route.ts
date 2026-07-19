import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import bcrypt from "bcryptjs";
import { clientIp, hashIp, pinLocked, pinFail, pinReset, galleryAccessToken } from "@/lib/security";

export async function POST(req: NextRequest) {
  const { slug, password } = await req.json();
  const [g] = await q(`SELECT id, view_password_hash FROM galleries WHERE slug=$1 AND is_published`, [slug]);
  if (!g || !g.view_password_hash) return NextResponse.json({ error: "This gallery isn't password protected." }, { status: 400 });

  const iph = hashIp(clientIp(req));
  const lockKey = `gallery-pw:${g.id}:${iph}`;
  const locked = await pinLocked(lockKey);
  if (locked) return NextResponse.json({ error: `Too many attempts. Try again in ${locked}s.` }, { status: 429 });

  if (!password || !(await bcrypt.compare(String(password), g.view_password_hash))) {
    await pinFail(lockKey);
    return NextResponse.json({ error: "That password isn't right." }, { status: 403 });
  }
  await pinReset(lockKey);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(`gv_${g.id}`, galleryAccessToken(g.id), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
