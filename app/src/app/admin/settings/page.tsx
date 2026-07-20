import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import { pendingCount } from "@/lib/moderation";
import { q } from "@/lib/db";
import AdminNav from "@/components/AdminNav"; import SiteSettingsForm from "@/components/SiteSettingsForm";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  if (user.role !== "owner") redirect("/admin");
  const n = await pendingCount();
  let settings: any = null;
  try { [settings] = await q(`SELECT * FROM site_settings WHERE id=true`); } catch {}
  return <><AdminNav user={user} pending={n} /><SiteSettingsForm initial={settings} /></>;
}
