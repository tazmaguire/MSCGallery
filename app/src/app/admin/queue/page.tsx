import { q } from "@/lib/db"; import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav"; import ModerationQueue from "@/components/ModerationQueue";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const rows = await q(
    `SELECT a.id, a.kind, a.width, a.height, a.bytes, a.thumb_key, a.preview_key, a.poster_key,
            c.first_name, c.display_name AS contributor_name, g.name AS gallery_name
     FROM assets a JOIN contributors c ON c.id=a.contributor_id JOIN galleries g ON g.id=a.gallery_id
     WHERE a.visibility='pending' AND a.status='ready' AND a.deletion_status IS NULL ORDER BY a.created_at`);
  const queue = rows.map((r: any) => ({ ...r, bytes: Number(r.bytes), thumb: `/thumbs/thumb/${r.thumb_key}`, preview: `/thumbs/preview/${r.preview_key || r.poster_key}` }));
  return <><AdminNav user={user} pending={queue.length} /><ModerationQueue initial={queue} /></>;
}
