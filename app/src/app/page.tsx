import { q } from "@/lib/db"; import Link from "next/link"; import ThemeToggle from "@/components/ThemeToggle";
import { siteConfig } from "@/lib/siteConfig";
import SiteHeader from "@/components/SiteHeader";
export const dynamic = "force-dynamic";
export default async function Home() {
  const site = siteConfig();
  const g = await q(`SELECT id, slug, name, event_date, location, brand FROM galleries WHERE is_published ORDER BY event_date DESC NULLS LAST`);
  // Custom covers (db/002_customisation.sql) — best-effort, see g/[slug]/page.tsx for why.
  const coverThumb: Record<string, string> = {};
  try {
    const rows = await q(`SELECT gal.id, cov.thumb_key FROM galleries gal JOIN assets cov ON cov.id = gal.cover_asset_id`);
    for (const r of rows) if (r.thumb_key) coverThumb[r.id] = r.thumb_key;
  } catch {}
  return (
    <div>
      <SiteHeader siteName={site.name} logoUrl={site.logoUrl} />
      <header className="border-b border-[var(--border)]"><div className="mx-auto max-w-4xl px-6 py-12"><div className="flex items-start justify-between"><h1 className="display text-4xl">Galleries</h1><ThemeToggle /></div></div></header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="space-y-2">
          {g.map((x: any) => (
            <Link key={x.slug} href={`/g/${x.slug}`} className="card flex items-center gap-4 p-4 transition hover:border-[var(--text-3)]">
              {coverThumb[x.id]
                ? <img src={`/thumbs/thumb/${coverThumb[x.id]}`} alt="" className="h-12 w-12 shrink-0 rounded-[var(--radius)] object-cover" />
                : <span className="h-12 w-1 shrink-0 rounded-full" style={{ background: x.brand?.primary || "#E8442A" }} />}
              <div><div className="display text-xl">{x.name}</div><div className="data text-[var(--text-2)]">{x.location}{x.event_date && ` · ${new Date(x.event_date).toLocaleDateString("en-GB")}`}</div></div>
            </Link>
          ))}
          {!g.length && <p className="data text-[var(--text-2)]">No galleries yet.</p>}
        </div>
      </div>
    </div>
  );
}
