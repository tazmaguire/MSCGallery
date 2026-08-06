import { q } from "@/lib/db"; import ThemeToggle from "@/components/ThemeToggle";
import { siteConfig } from "@/lib/siteConfig";
import SiteHeader from "@/components/SiteHeader";
import GalleryGrid from "@/components/GalleryGrid";
export const dynamic = "force-dynamic";
export default async function Home() {
  const site = await siteConfig();
  let g: any[];
  try {
    g = await q(
      `SELECT gal.id, gal.slug, gal.name, gal.event_date, gal.location, gal.brand, gc.name AS category_name, gc.sort_order AS category_sort
       FROM galleries gal LEFT JOIN gallery_categories gc ON gc.id=gal.category_id
       WHERE gal.is_published AND NOT gal.is_unlisted ORDER BY gc.sort_order NULLS LAST, gc.name NULLS LAST, gal.event_date DESC NULLS LAST`);
  } catch {
    // db/007_config_and_categories.sql not applied yet — fall back to no categories/unlisted filter.
    g = await q(`SELECT id, slug, name, event_date, location, brand FROM galleries WHERE is_published ORDER BY event_date DESC NULLS LAST`);
  }
  // Custom covers (db/002_customisation.sql) — best-effort, see g/[slug]/page.tsx for why.
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
    <div>
      <SiteHeader siteName={site.name} logoUrl={site.logoUrl} displayMode={site.displayMode} />
      <header className="border-b border-[var(--border)]"><div className="mx-auto max-w-6xl px-6 py-12"><div className="flex items-start justify-between"><h1 className="display text-4xl">Galleries</h1><ThemeToggle /></div></div></header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <GalleryGrid galleries={tiles} />
        {!g.length && <p className="data text-[var(--text-2)]">No galleries yet.</p>}
      </div>
      {(site.footerText || site.contactEmail) && (
        <footer className="mx-auto max-w-6xl px-6 py-8 text-center">
          {site.footerText && <p className="data text-[var(--text-3)]">{site.footerText}</p>}
          {site.contactEmail && <a href={`mailto:${site.contactEmail}`} className="data mt-1 inline-block text-[var(--text-3)] hover:text-[var(--text-2)]">{site.contactEmail}</a>}
        </footer>
      )}
    </div>
  );
}
