import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import { pendingCount } from "@/lib/moderation";
import AdminNav from "@/components/AdminNav";
import SettingsTabs from "@/components/SettingsTabs";
import UpdatesPanel from "@/components/UpdatesPanel";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  if (user.role !== "owner") redirect("/admin");
  const n = await pendingCount();
  return (
    <>
      <AdminNav user={user} pending={n} />
      <SettingsTabs />
      <UpdatesPanel />
    </>
  );
}
