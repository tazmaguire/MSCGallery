import { getUser } from "@/lib/auth"; import { redirect } from "next/navigation";
import { pendingQueue, pendingCount } from "@/lib/moderation";
import AdminNav from "@/components/AdminNav"; import ModerationQueue from "@/components/ModerationQueue";
export const dynamic = "force-dynamic";
export default async function P() {
  const user = await getUser(); if (!user) redirect("/admin/login");
  const rows = await pendingQueue();
  const total = await pendingCount();
  const queue = rows.map((r: any) => ({ ...r, bytes: Number(r.bytes), thumb: `/thumbs/thumb/${r.thumb_key}`, preview: `/thumbs/preview/${r.preview_key || r.poster_key}` }));
  return <><AdminNav user={user} pending={total} /><ModerationQueue initial={queue} /></>;
}
