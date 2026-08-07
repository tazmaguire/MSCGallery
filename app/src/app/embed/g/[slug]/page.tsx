import { q } from "@/lib/db";
import { siteConfig } from "@/lib/siteConfig";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
export const dynamic = "force-dynamic";

const PHOTO_LIMIT = 30;

export default async function EmbedGallery({ params }: { params: { slug: string } }) {
  const site = await siteConfig();
  // Unlisted galleries CAN be embedded directly — that's the point of
  // "unlisted", it's just not on the home page. Unpublished ones can't:
  // is_published is what actually gates whether the link works at all.
  const [g] = await q(`SELECT * FROM galleries WHERE slug=$1 AND is_published`, [params.slug]);
  if (!g) notFound();

  if (g.view_password_hash) {
    return (
      <div className="grid min-h-[240px] place-items-center px-5 py-10 text-center">
        <div>
          <Lock size={20} className="mx-auto mb-3 text-[var(--text-3)]" />
          <p className="data mb-4 text-[var(--text-2)]">This gallery is password protected.</p>
          <a href={`/g/${g.slug}`} target="_blank" rel="noopener" className="btn-primary inline-flex items-center px-4 py-2 text-sm">Open {g.name}</a>
        </div>
      </div>
    );
  }

  const rows = await q(
    `SELECT a.id, a.thumb_key FROM assets a
     WHERE a.gallery_id=$1 AND a.visibility='visible' AND a.status='ready' AND (a.deletion_status IS NULL OR a.deletion_status='')
     ORDER BY a.taken_at DESC NULLS LAST, a.created_at DESC LIMIT $2`, [g.id, PHOTO_LIMIT]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <div className="mb-5">
        <h1 className="display text-2xl">{g.name}</h1>
        <p className="data mt-1 text-[var(--text-3)]">
          {g.location}{g.location && g.event_date && " · "}
          {g.event_date && new Date(g.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {rows.map((r: any) => (
          <a key={r.id} href={`/g/${g.slug}`} target="_blank" rel="noopener" className="group block aspect-square overflow-hidden rounded-[var(--radius)] bg-[var(--surface)]">
            {r.thumb_key && <img src={`/thumbs/thumb/${r.thumb_key}`} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />}
          </a>
        ))}
        {!rows.length && <p className="data col-span-full py-16 text-center text-[var(--text-2)]">No photos yet.</p>}
      </div>
      <a href={`/g/${g.slug}`} target="_blank" rel="noopener" className="data mt-6 block text-center text-[var(--text-3)] hover:text-[var(--text-2)]">
        View full gallery on {site.name}
      </a>
    </div>
  );
}
