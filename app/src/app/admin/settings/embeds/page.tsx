import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import { pendingCount } from "@/lib/moderation";
import { q } from "@/lib/db";
import { resolveConfig } from "@/lib/secrets";
import { headers } from "next/headers";
import AdminNav from "@/components/AdminNav";
import SettingsTabs from "@/components/SettingsTabs";
import EmbedsForm from "@/components/EmbedsForm";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  if (user.role !== "owner") redirect("/admin");
  const n = await pendingCount();
  const galleries = await q(`SELECT id, slug, name FROM galleries WHERE is_published ORDER BY name`);
  let categories: any[] = [];
  try { categories = await q(`SELECT id, slug, name FROM gallery_categories ORDER BY name`); } catch {}
  const baseUrl = (await resolveConfig("public_site_url", "PUBLIC_SITE_URL")) || `https://${headers().get("host")}`;
  return (
    <>
      <AdminNav user={user} pending={n} />
      <SettingsTabs />
      <EmbedsForm galleries={galleries} categories={categories} baseUrl={baseUrl} />
    </>
  );
}
