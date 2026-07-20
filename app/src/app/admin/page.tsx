import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import { pendingCount } from "@/lib/moderation";
import AdminNav from "@/components/AdminNav"; import GalleryList from "@/components/GalleryList";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const n = await pendingCount();
  return <><AdminNav user={user} pending={n} /><GalleryList isOwner={user.role === "owner"} /></>;
}
