import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import { pendingCount } from "@/lib/moderation";
import AdminNav from "@/components/AdminNav"; import AccountForm from "@/components/AccountForm";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const n = await pendingCount();
  return <><AdminNav user={user} pending={n} /><AccountForm initial={{ email: user.email, display_name: user.display_name, role: user.role }} /></>;
}
