import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSession } from "@/lib/auth";
import { clientIp, hashIp, rateLimit, audit } from "@/lib/security";
export async function POST(req: NextRequest) {
  const iph = hashIp(clientIp(req));
  // 5 attempts/min, burst 5 — brute force gets nowhere.
  if (!(await rateLimit(`login:${iph}`, 5 / 60, 5)))
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  const { email, password } = await req.json();
  const u = await verifyPassword(email, password);
  if (!u) { await audit(null, "login_fail", { email }, iph); return NextResponse.json({ error: "no" }, { status: 401 }); }
  await createSession(u);
  await audit(u.id, "login", null, iph);
  return NextResponse.json({ ok: true });
}
