import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import { pendingQueue, pendingCount, pendingGalleries } from "@/lib/moderation";
import AdminNav from "@/components/AdminNav"; import ModerationQueue from "@/components/ModerationQueue";
export const dynamic = "force-dynamic";
export default async function P({ searchParams }: { searchParams: { gallery?: string } }) {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const galleryId = searchParams.gallery || undefined;
  const [rows, badgeCount, galleries] = await Promise.all([
    pendingQueue(galleryId),
    pendingCount(galleryId),
    pendingGalleries(),
  ]);
  const queue = rows.map((r: any) => ({ ...r, bytes: Number(r.bytes), thumb: `/thumbs/thumb/${r.thumb_key}`, preview: `/thumbs/preview/${r.preview_key || r.poster_key}` }));
  return <><AdminNav user={user} pending={badgeCount} /><ModerationQueue key={galleryId || "all"} initial={queue} galleries={galleries} activeGallery={galleryId || null} /></>;
}
