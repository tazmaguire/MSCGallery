import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser, hashPassword } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";

export async function GET() {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const users = await q(`SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at`);
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const { email, display_name, password, role } = await req.json();
  if (!email?.trim() || !display_name?.trim()) return NextResponse.json({ error: "Email and name are required." }, { status: 400 });
  if (!password || String(password).length < 12) return NextResponse.json({ error: "Password must be at least 12 characters." }, { status: 400 });
  const r = role === "owner" ? "owner" : "moderator";

  const [clash] = await q(`SELECT id FROM users WHERE lower(email)=lower($1)`, [email.trim()]);
  if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });

  const [u] = await q(
    `INSERT INTO users (email, password_hash, display_name, role) VALUES ($1,$2,$3,$4)
     RETURNING id, email, display_name, role, created_at`,
    [email.trim(), await hashPassword(password), display_name.trim(), r]);
  await audit(user.id, "create_user", { email: u.email, role: u.role }, hashIp(clientIp(req)));
  return NextResponse.json({ user: u });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(); if (!user || user.role !== "owner") return NextResponse.json({ error: "owners only" }, { status: 403 });
  const { id } = await req.json();
  if (id === user.id) return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });

  const [target] = await q(`SELECT role FROM users WHERE id=$1`, [id]);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "owner") {
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM users WHERE role='owner'`);
    if (n <= 1) return NextResponse.json({ error: "Can't delete the last owner." }, { status: 400 });
  }
  await q(`DELETE FROM users WHERE id=$1`, [id]);
  await audit(user.id, "delete_user", { id }, hashIp(clientIp(req)));
  return NextResponse.json({ ok: true });
}
