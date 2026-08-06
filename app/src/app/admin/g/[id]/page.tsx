import { q } from "@/lib/db"; import { getUser } from "@/lib/auth"; import { redirect, notFound } from "next/navigation";
import { pendingCount } from "@/lib/moderation";
import AdminNav from "@/components/AdminNav"; import GalleryManager from "@/components/GalleryManager";
export const dynamic = "force-dynamic";
export default async function P({ params }: { params: { id: string } }) {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const [g] = await q(`SELECT * FROM galleries WHERE id=$1`, [params.id]); if (!g) notFound();
  const n = await pendingCount();
  // Storage occupied by this gallery — see api/admin/galleries's GET for what
  // counts (original + deliverable bytes, db/008_asset_public_bytes.sql).
  let storageBytes = 0;
  try {
    const [row] = await q(`SELECT COALESCE(SUM(COALESCE(bytes,0) + COALESCE(public_bytes,0)),0) AS b FROM assets WHERE gallery_id=$1`, [g.id]);
    storageBytes = Number(row?.b || 0);
  } catch {
    try {
      const [row] = await q(`SELECT COALESCE(SUM(bytes),0) AS b FROM assets WHERE gallery_id=$1`, [g.id]);
      storageBytes = Number(row?.b || 0);
    } catch {}
  }
  return <><AdminNav user={user} pending={n} /><GalleryManager gallery={g} isOwner={user.role === "owner"} storageBytes={storageBytes} /></>;
}
