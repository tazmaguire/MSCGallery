import { q } from "@/lib/db"; import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav"; import GalleryList from "@/components/GalleryList";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM assets WHERE visibility='pending' AND status='ready'`);
  return <><AdminNav user={user} pending={n} /><GalleryList isOwner={user.role === "owner"} /></>;
}
