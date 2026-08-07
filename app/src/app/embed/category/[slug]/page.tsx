import { q } from "@/lib/db";
import { siteConfig } from "@/lib/siteConfig";
import GalleryGrid from "@/components/GalleryGrid";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";

export default async function EmbedCategory({ params }: { params: { slug: string } }) {
  const site = await siteConfig();
  let category: any;
  let g: any[] = [];
  try {
    [category] = await q(`SELECT * FROM gallery_categories WHERE slug=$1`, [params.slug]);
    if (!category) notFound();
  } catch {
    // db/007_config_and_categories.sql not applied yet — no categories exist to embed.
    notFound();
  }
  try {
    g = await q(
      `SELECT gal.id, gal.slug, gal.name, gal.event_date, gal.location, gal.brand
       FROM galleries gal WHERE gal.category_id=$1 AND gal.is_published AND NOT gal.is_unlisted
       ORDER BY gal.sort_order, gal.event_date DESC NULLS LAST`, [category.id]);
  } catch {
    // db/011_gallery_sort_order.sql not applied yet.
    g = await q(
      `SELECT gal.id, gal.slug, gal.name, gal.event_date, gal.location, gal.brand
       FROM galleries gal WHERE gal.category_id=$1 AND gal.is_published AND NOT gal.is_unlisted
       ORDER BY gal.event_date DESC NULLS LAST`, [category.id]);
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
    category: category.name, brand: x.brand,
    cover: coverThumb[x.id] ? `/thumbs/thumb/${coverThumb[x.id]}` : null,
  }));
  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <h1 className="eyebrow mb-6">{category.name}</h1>
      <GalleryGrid galleries={tiles} hideFilter linkTarget="_blank" />
      {!g.length && <p className="data py-16 text-center text-[var(--text-2)]">No galleries in this category yet.</p>}
      <a href="/" target="_blank" rel="noopener" className="data mt-8 block text-center text-[var(--text-3)] hover:text-[var(--text-2)]">
        View all on {site.name}
      </a>
    </div>
  );
}
