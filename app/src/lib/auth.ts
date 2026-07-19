import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { q } from "./db";

const COOKIE = "gallery_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);
export type SessionUser = { id: string; email: string; display_name: string; role: "owner" | "moderator" };

export async function verifyPassword(email: string, password: string) {
  const [u] = await q(`SELECT * FROM users WHERE lower(email)=lower($1)`, [email]);
  if (!u) { await bcrypt.compare(password, "$2a$10$" + "x".repeat(53)); return null; }
  if (!(await bcrypt.compare(password, u.password_hash))) return null;
  return { id: u.id, email: u.email, display_name: u.display_name, role: u.role } as SessionUser;
}
export async function createSession(u: SessionUser) {
  const t = await new SignJWT({ ...u }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("30d").sign(secret());
  cookies().set(COOKIE, t, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2592000 });
}
export async function getUser(): Promise<SessionUser | null> {
  const t = cookies().get(COOKIE)?.value; if (!t) return null;
  try { return (await jwtVerify(t, secret())).payload as any; } catch { return null; }
}
export async function hashPassword(pw: string) { return bcrypt.hash(pw, 12); }
