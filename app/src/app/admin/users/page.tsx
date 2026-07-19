import { q } from "@/lib/db"; import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav"; import UsersManager from "@/components/UsersManager";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  if (user.role !== "owner") redirect("/admin");
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM assets WHERE visibility='pending' AND status='ready'`);
  return <><AdminNav user={user} pending={n} /><UsersManager currentUserId={user.id} /></>;
}
