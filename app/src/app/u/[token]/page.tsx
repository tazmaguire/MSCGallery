import { q } from "@/lib/db"; import Uploader from "@/components/Uploader"; import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function P({ params }: { params: { token: string } }) {
  const [l] = await q(`SELECT l.mode, l.is_active, g.slug, g.name, g.brand, g.upload_terms, g.allow_uploads
    FROM upload_links l JOIN galleries g ON g.id=l.gallery_id WHERE l.token=$1 AND (l.expires_at IS NULL OR l.expires_at > now())`, [params.token]);
  if (!l || !l.is_active || l.mode === "photographer") notFound();
  if (!l.allow_uploads) return <div className="grid min-h-screen place-items-center px-4 text-center text-[var(--text-2)]"><p>Uploads are closed for this event.</p></div>;
  return <Uploader token={params.token} mode={l.mode} gallerySlug={l.slug} galleryName={l.name} terms={l.upload_terms || ""} brand={{ primary: l.brand?.primary || "#E8442A", accent: l.brand?.accent || "#D6E04B" }} />;
}
