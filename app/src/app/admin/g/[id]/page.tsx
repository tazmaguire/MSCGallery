import { q } from "@/lib/db"; import { getUser } from "@/lib/auth"; import { redirect, notFound } from "next/navigation";
import AdminNav from "@/components/AdminNav"; import GalleryManager from "@/components/GalleryManager";
export const dynamic = "force-dynamic";
export default async function P({ params }: { params: { id: string } }) {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const [g] = await q(`SELECT * FROM galleries WHERE id=$1`, [params.id]); if (!g) notFound();
  return <><AdminNav user={user} /><GalleryManager gallery={g} isOwner={user.role === "owner"} /></>;
}
