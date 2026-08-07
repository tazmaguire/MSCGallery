import { q } from "@/lib/db";
import { siteConfig } from "@/lib/siteConfig";
import { gallerySortClause } from "@/lib/gallerySort";
import GalleryGrid from "@/components/GalleryGrid";
export const dynamic = "force-dynamic";

export default async function EmbedAll() {
  const site = await siteConfig();
  let g: any[];
  try {
    g = await q(
      `SELECT gal.id, gal.slug, gal.name, gal.event_date, gal.location, gal.brand, gc.name AS category_name
       FROM galleries gal LEFT JOIN gallery_categories gc ON gc.id=gal.category_id
       WHERE gal.is_published AND NOT gal.is_unlisted
       ORDER BY gc.sort_order NULLS LAST, gc.name NULLS LAST, ${gallerySortClause(site.gallerySortMode)}`);
  } catch {
    g = await q(`SELECT id, slug, name, event_date, location, brand FROM galleries WHERE is_published ORDER BY event_date ASC NULLS LAST`);
  }
  const coverThumb: Record<string, string> = {};
  try {
    const rows = await q(
      `SELECT gal.id, cov.thumb_key FROM galleries gal JOIN assets cov ON cov.id = gal.cover_asset_id
       WHERE cov.visibility='visible' AND cov.status='ready' AND (cov.deletion_status IS NULL OR cov.deletion_status='')`);
    for (const r of rows) if (r.thumb_key) coverThumb[r.id] = r.thumb_key;
  } catch {}
  const tiles = g.map((x: any) => ({
    id: x.id, slug: x.slug, name: x.name, location: x.location, event_date: x.event_date,
    category: x.category_name || null, brand: x.brand,
    cover: coverThumb[x.id] ? `/thumbs/thumb/${coverThumb[x.id]}` : null,
  }));
  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <GalleryGrid galleries={tiles} linkTarget="_blank" />
      {!g.length && <p className="data py-16 text-center text-[var(--text-2)]">No galleries yet.</p>}
      <a href="/" target="_blank" rel="noopener" className="data mt-8 block text-center text-[var(--text-3)] hover:text-[var(--text-2)]">
        View all on {site.name}
      </a>
    </div>
  );
}
