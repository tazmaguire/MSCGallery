import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser, createSession, hashPassword } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";
import bcrypt from "bcryptjs";

export async function GET() {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const [u] = await q(`SELECT id, email, display_name, role FROM users WHERE id=$1`, [user.id]);
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ user: u });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { display_name, email, current_password, new_password } = await req.json();
  const iph = hashIp(clientIp(req));

  const [u] = await q(`SELECT * FROM users WHERE id=$1`, [user.id]);
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (new_password) {
    if (!current_password || !(await bcrypt.compare(current_password, u.password_hash)))
      return NextResponse.json({ error: "Current password is wrong." }, { status: 403 });
    if (String(new_password).length < 12)
      return NextResponse.json({ error: "New password must be at least 12 characters." }, { status: 400 });
    await q(`UPDATE users SET password_hash=$2 WHERE id=$1`, [user.id, await hashPassword(new_password)]);
    await audit(user.id, "change_password", null, iph);
  }

  if (display_name?.trim()) await q(`UPDATE users SET display_name=$2 WHERE id=$1`, [user.id, display_name.trim()]);

  if (email?.trim() && email.trim().toLowerCase() !== u.email.toLowerCase()) {
    const [clash] = await q(`SELECT id FROM users WHERE lower(email)=lower($1) AND id<>$2`, [email.trim(), user.id]);
    if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    await q(`UPDATE users SET email=$2 WHERE id=$1`, [user.id, email.trim()]);
  }

  const [fresh] = await q(`SELECT id, email, display_name, role FROM users WHERE id=$1`, [user.id]);
  // Session JWT carries email/display_name — refresh it so the new values show immediately.
  await createSession({ id: fresh.id, email: fresh.email, display_name: fresh.display_name, role: fresh.role });
  await audit(user.id, "update_account", { display_name: !!display_name, email: !!email }, iph);
  return NextResponse.json({ user: fresh });
}
