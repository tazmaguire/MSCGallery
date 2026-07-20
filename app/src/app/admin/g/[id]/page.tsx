import { q } from "@/lib/db"; import { getUser } from "@/lib/auth"; import { redirect, notFound } from "next/navigation";
import { pendingCount } from "@/lib/moderation";
import AdminNav from "@/components/AdminNav"; import GalleryManager from "@/components/GalleryManager";
export const dynamic = "force-dynamic";
export default async function P({ params }: { params: { id: string } }) {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const [g] = await q(`SELECT * FROM galleries WHERE id=$1`, [params.id]); if (!g) notFound();
  const n = await pendingCount();
  return <><AdminNav user={user} pending={n} /><GalleryManager gallery={g} isOwner={user.role === "owner"} /></>;
}
